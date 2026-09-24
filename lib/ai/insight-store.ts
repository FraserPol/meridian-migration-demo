import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { portfolioInsights } from "@/lib/db/schema";

/**
 * Read side of the portfolio-insight cache.
 *
 * Deliberately NOT in app/dashboard/insight-actions.ts. Every export of a
 * "use server" module is a callable endpoint, so a reader taking a
 * `userId` argument would let any signed-in customer fetch another
 * customer's insight by passing someone else's id. Server components call
 * this directly instead, and the only caller passes the id from its own
 * verified session.
 */
export async function latestInsight(
  userId: string,
  fingerprint: string,
  hdrs: Headers,
): Promise<{ insight: string; createdAt: Date; stale: boolean } | null> {
  const db = await getDb(hdrs);
  const [row] = await db
    .select()
    .from(portfolioInsights)
    .where(eq(portfolioInsights.userId, userId))
    .orderBy(desc(portfolioInsights.createdAt))
    .limit(1);

  if (!row) return null;
  return { insight: row.insight, createdAt: row.createdAt, stale: row.fingerprint !== fingerprint };
}
