"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { portfolioInsights, profiles, watchlistItems } from "@/lib/db/schema";
import { getSession, VaultUnavailableError, VAULT_UNAVAILABLE_MESSAGE } from "@/lib/session";
import { computeQuotes } from "@/lib/quotes";
import { summarizePortfolio } from "@/lib/portfolio";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { getDailyBudgetStatus } from "@/lib/ai/budget";
import { fingerprintPortfolio, generateInsight, type InsightInput } from "@/lib/ai/insights";

export type InsightState = { error?: string } | undefined;

/**
 * Generates a portfolio insight, or returns the cached one when the
 * portfolio behind it hasn't changed.
 *
 * The cache check happens before the budget check on purpose: serving an
 * existing insight costs nothing, so a customer whose portfolio is
 * unchanged shouldn't be turned away because an unrelated admin exhausted
 * today's model spend.
 */
export async function requestInsight(
  _prevState: InsightState,
  _formData: FormData,
): Promise<InsightState> {
  const hdrs = await headers();

  let session;
  try {
    session = await getSession(hdrs);
  } catch (err) {
    if (err instanceof VaultUnavailableError) return { error: VAULT_UNAVAILABLE_MESSAGE };
    throw err;
  }
  if (!session) return { error: "Not signed in." };

  try {
    const db = await getDb(hdrs);

    const [[profile], items] = await Promise.all([
      db.select().from(profiles).where(eq(profiles.userId, session.userId)).limit(1),
      db.select().from(watchlistItems).where(eq(watchlistItems.userId, session.userId)),
    ]);

    if (!profile) {
      return { error: "Create your profile first — the insight is written against your stated risk tolerance." };
    }

    const quotes = computeQuotes(items.map((i) => i.ticker));
    const summary = summarizePortfolio(items, new Map(quotes.map((q) => [q.ticker, q])));
    if (summary.positions.length === 0) {
      return { error: "Add shares and an average cost to at least one ticker first." };
    }

    const held = new Set(summary.positions.map((p) => p.ticker));
    const input: InsightInput = {
      riskTolerance: profile.riskTolerance,
      investmentGoal: profile.investmentGoal,
      summary,
      watchingOnly: items.map((i) => i.ticker).filter((t) => !held.has(t)),
    };
    const fingerprint = fingerprintPortfolio(input);

    const [cached] = await db
      .select()
      .from(portfolioInsights)
      .where(
        and(
          eq(portfolioInsights.userId, session.userId),
          eq(portfolioInsights.fingerprint, fingerprint),
        ),
      )
      .limit(1);
    if (cached) {
      revalidatePath("/dashboard");
      return;
    }

    const budget = await getDailyBudgetStatus(db);
    if (budget.exceeded) {
      return {
        error: `Today's AI budget is spent ($${budget.spentTodayUsd.toFixed(2)} of $${budget.limitUsd.toFixed(2)}). Insights resume at 00:00 UTC.`,
      };
    }

    const generated = await generateInsight(input, session.email);
    await db.insert(portfolioInsights).values({
      userId: session.userId,
      fingerprint,
      insight: generated.insight,
      provider: generated.provider,
      modelId: generated.modelId,
      inputTokens: generated.inputTokens,
      outputTokens: generated.outputTokens,
      estimatedCostUsd: estimateCostUsd(
        generated.provider,
        generated.modelId,
        generated.inputTokens,
        generated.outputTokens,
      ).toFixed(6),
    });
  } catch (err) {
    if (err instanceof VaultUnavailableError) return { error: VAULT_UNAVAILABLE_MESSAGE };
    // A Gateway failure shouldn't take the dashboard down — this is an
    // optional panel on a page that works fine without it.
    return {
      error: `Couldn't generate an insight just now${err instanceof Error ? `: ${err.message}` : "."}`,
    };
  }

  revalidatePath("/dashboard");
}

// The read side lives in lib/ai/insight-store.ts, not here: every export
// of a "use server" module is a callable endpoint, and a reader taking a
// userId argument would let any signed-in customer fetch someone else's
// insight.
