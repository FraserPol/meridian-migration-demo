import { gte, sql } from "drizzle-orm";
import { migrationCopilotRuns } from "@/lib/db/schema";
import type { Db } from "@/lib/db";

/**
 * Spend guardrail for the Migration Copilot.
 *
 * The audit trail already records an estimated cost per run
 * (workflows/migration-copilot/workflow.ts), so a cap is a query over data
 * that's already there rather than new bookkeeping. This answers the
 * question the cost-visibility pitch invites from Finance: seeing spend is
 * good, but what actually stops it.
 *
 * Deliberately a per-day cap on the whole tool rather than per-admin: the
 * budget Finance cares about is the feature's, and a per-user cap is
 * trivially worked around by asking a colleague to run the query.
 */
const DEFAULT_DAILY_BUDGET_USD = 5;

export function dailyBudgetUsd(): number {
  const raw = Number(process.env.COPILOT_DAILY_BUDGET_USD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_BUDGET_USD;
}

export type BudgetStatus = {
  spentTodayUsd: number;
  limitUsd: number;
  remainingUsd: number;
  exceeded: boolean;
};

/**
 * Sums only `estimated_cost_usd`. `classifier_cost_usd` is a breakdown of
 * that same figure (see lib/db/schema.ts), not an additional charge —
 * adding the two would double-count the classifier.
 */
export async function getDailyBudgetStatus(db: Db): Promise<BudgetStatus> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${migrationCopilotRuns.estimatedCostUsd}), 0)`,
    })
    .from(migrationCopilotRuns)
    .where(gte(migrationCopilotRuns.createdAt, startOfDay));

  const spentTodayUsd = Number(row?.total ?? 0);
  const limitUsd = dailyBudgetUsd();

  return {
    spentTodayUsd,
    limitUsd,
    remainingUsd: Math.max(0, limitUsd - spentTodayUsd),
    exceeded: spentTodayUsd >= limitUsd,
  };
}
