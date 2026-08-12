"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { watchlistItems } from "@/lib/db/schema";
import { getSession } from "@/lib/session";
import { computeQuotes } from "@/lib/quotes";

export type WatchlistState = { error?: string } | undefined;

export async function addTicker(
  _prevState: WatchlistState,
  formData: FormData,
): Promise<WatchlistState> {
  const hdrs = await headers();
  const session = await getSession(hdrs);
  if (!session) return { error: "Not signed in." };

  const ticker = String(formData.get("ticker") ?? "")
    .trim()
    .toUpperCase();

  if (!/^[A-Z]{1,6}$/.test(ticker)) {
    return { error: "Enter a valid ticker symbol (letters only, e.g. AAPL)." };
  }

  const [quote] = computeQuotes([ticker]);

  const db = await getDb(hdrs);
  await db
    .insert(watchlistItems)
    .values({ userId: session.userId, ticker, addedAtPrice: String(quote.price) })
    .onConflictDoNothing();

  revalidatePath("/dashboard/watchlist");
  revalidatePath("/dashboard");
}

export async function removeTicker(formData: FormData): Promise<void> {
  const hdrs = await headers();
  const session = await getSession(hdrs);
  if (!session) return;

  const itemId = String(formData.get("itemId") ?? "");
  const db = await getDb(hdrs);
  await db
    .delete(watchlistItems)
    .where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.userId, session.userId)));

  revalidatePath("/dashboard/watchlist");
  revalidatePath("/dashboard");
}
