"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { priceAlerts, watchlistItems } from "@/lib/db/schema";
import { getSession, VaultUnavailableError, VAULT_UNAVAILABLE_MESSAGE } from "@/lib/session";
import { computeQuotes } from "@/lib/quotes";
import { isAlertDirection } from "@/lib/alerts";

export type WatchlistState = { error?: string } | undefined;

type ParsedHolding = { quantity: string | null; costBasis: string | null };

/**
 * Reads the optional shares / average-cost pair off a form. Returns them
 * as strings because the columns are numeric — passing a JS number
 * through would round-trip through a float on the way to a fixed-precision
 * column.
 */
function parseHolding(formData: FormData): ParsedHolding | { error: string } {
  const rawQuantity = String(formData.get("quantity") ?? "").trim();
  const rawCost = String(formData.get("costBasis") ?? "").trim();

  if (!rawQuantity && !rawCost) return { quantity: null, costBasis: null };
  if (!rawQuantity || !rawCost) {
    return { error: "Enter both a share count and an average cost, or leave both blank." };
  }

  const quantity = Number(rawQuantity);
  const costBasis = Number(rawCost);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: "Share count must be a positive number." };
  }
  if (!Number.isFinite(costBasis) || costBasis <= 0) {
    return { error: "Average cost must be a positive number." };
  }

  return { quantity: String(quantity), costBasis: costBasis.toFixed(2) };
}

export async function addTicker(
  _prevState: WatchlistState,
  formData: FormData,
): Promise<WatchlistState> {
  const hdrs = await headers();

  let session;
  try {
    session = await getSession(hdrs);
  } catch (err) {
    if (err instanceof VaultUnavailableError) return { error: VAULT_UNAVAILABLE_MESSAGE };
    throw err;
  }
  if (!session) return { error: "Not signed in." };

  const ticker = String(formData.get("ticker") ?? "")
    .trim()
    .toUpperCase();

  if (!/^[A-Z]{1,6}$/.test(ticker)) {
    return { error: "Enter a valid ticker symbol (letters only, e.g. AAPL)." };
  }

  // Shares and cost are optional and only meaningful together — a
  // quantity with no price paid can't produce a profit-and-loss figure,
  // so the pair is rejected rather than silently half-stored.
  const holding = parseHolding(formData);
  if ("error" in holding) return holding;

  const [quote] = computeQuotes([ticker]);

  try {
    const db = await getDb(hdrs);
    await db
      .insert(watchlistItems)
      .values({
        userId: session.userId,
        ticker,
        addedAtPrice: String(quote.price),
        quantity: holding.quantity,
        costBasis: holding.costBasis,
      })
      .onConflictDoNothing();
  } catch (err) {
    if (err instanceof VaultUnavailableError) return { error: VAULT_UNAVAILABLE_MESSAGE };
    throw err;
  }

  revalidatePath("/dashboard/watchlist");
  revalidatePath("/dashboard");
}

/**
 * Sets or clears the position held against an existing watchlist row, so
 * a ticker someone already tracks can become a real holding without being
 * removed and re-added (which would lose its added-at price).
 */
export async function updateHolding(
  _prevState: WatchlistState,
  formData: FormData,
): Promise<WatchlistState> {
  const hdrs = await headers();

  let session;
  try {
    session = await getSession(hdrs);
  } catch (err) {
    if (err instanceof VaultUnavailableError) return { error: VAULT_UNAVAILABLE_MESSAGE };
    throw err;
  }
  if (!session) return { error: "Not signed in." };

  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return { error: "Missing watchlist item." };

  const holding = parseHolding(formData);
  if ("error" in holding) return holding;

  try {
    const db = await getDb(hdrs);
    await db
      .update(watchlistItems)
      .set({ quantity: holding.quantity, costBasis: holding.costBasis })
      // Scoped by userId as well as id: the item id arrives from the
      // client, so ownership is enforced here rather than assumed.
      .where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.userId, session.userId)));
  } catch (err) {
    if (err instanceof VaultUnavailableError) return { error: VAULT_UNAVAILABLE_MESSAGE };
    throw err;
  }

  revalidatePath("/dashboard/watchlist");
  revalidatePath("/dashboard");
}

export async function createAlert(
  _prevState: WatchlistState,
  formData: FormData,
): Promise<WatchlistState> {
  const hdrs = await headers();

  let session;
  try {
    session = await getSession(hdrs);
  } catch (err) {
    if (err instanceof VaultUnavailableError) return { error: VAULT_UNAVAILABLE_MESSAGE };
    throw err;
  }
  if (!session) return { error: "Not signed in." };

  const ticker = String(formData.get("ticker") ?? "")
    .trim()
    .toUpperCase();
  const direction = String(formData.get("direction") ?? "");
  const threshold = Number(String(formData.get("threshold") ?? "").trim());

  if (!/^[A-Z]{1,6}$/.test(ticker)) {
    return { error: "Choose a ticker to watch." };
  }
  if (!isAlertDirection(direction)) {
    return { error: "Choose whether to alert above or below the price." };
  }
  if (!Number.isFinite(threshold) || threshold <= 0) {
    return { error: "Enter a target price greater than zero." };
  }

  try {
    const db = await getDb(hdrs);
    await db.insert(priceAlerts).values({
      userId: session.userId,
      ticker,
      direction,
      threshold: threshold.toFixed(2),
    });
  } catch (err) {
    if (err instanceof VaultUnavailableError) return { error: VAULT_UNAVAILABLE_MESSAGE };
    throw err;
  }

  revalidatePath("/dashboard/watchlist");
}

export async function deleteAlert(formData: FormData): Promise<void> {
  const hdrs = await headers();

  let session;
  try {
    session = await getSession(hdrs);
  } catch (err) {
    if (err instanceof VaultUnavailableError) return;
    throw err;
  }
  if (!session) return;

  const alertId = String(formData.get("alertId") ?? "");
  try {
    const db = await getDb(hdrs);
    await db
      .delete(priceAlerts)
      .where(and(eq(priceAlerts.id, alertId), eq(priceAlerts.userId, session.userId)));
  } catch (err) {
    if (err instanceof VaultUnavailableError) return;
    throw err;
  }

  revalidatePath("/dashboard/watchlist");
}

export async function removeTicker(formData: FormData): Promise<void> {
  const hdrs = await headers();

  let session;
  try {
    session = await getSession(hdrs);
  } catch (err) {
    // No error state to surface here (removeTicker returns void — see
    // remove-ticker-button.tsx), so this matches the !session branch
    // below: no-op rather than crashing to the error boundary.
    if (err instanceof VaultUnavailableError) return;
    throw err;
  }
  if (!session) return;

  const itemId = String(formData.get("itemId") ?? "");
  try {
    const db = await getDb(hdrs);
    await db
      .delete(watchlistItems)
      .where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.userId, session.userId)));
  } catch (err) {
    if (err instanceof VaultUnavailableError) return;
    throw err;
  }

  revalidatePath("/dashboard/watchlist");
  revalidatePath("/dashboard");
}
