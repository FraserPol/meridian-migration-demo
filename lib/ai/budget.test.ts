import { describe, it, expect, afterEach } from "vitest";
import type { Db } from "@/lib/db";
import { dailyBudgetUsd, getDailyBudgetStatus } from "./budget";

/**
 * The spend cap is the only thing that actually stops Migration Copilot
 * runs (app/api/chat/route.ts gates on `exceeded` before start()), so the
 * threshold boundary is worth pinning down: a cap that silently never
 * fires looks identical to one that works until the bill arrives.
 *
 * Stubs the query builder rather than reaching for a database — the
 * arithmetic and the boundary are what's under test, not drizzle.
 */
function dbReturning(total: string): Db {
  return {
    select: () => ({
      from: () => ({
        where: async () => [{ total }],
      }),
    }),
  } as unknown as Db;
}

const ORIGINAL = process.env.COPILOT_DAILY_BUDGET_USD;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.COPILOT_DAILY_BUDGET_USD;
  else process.env.COPILOT_DAILY_BUDGET_USD = ORIGINAL;
});

describe("dailyBudgetUsd", () => {
  it("defaults to $5 when unset", () => {
    delete process.env.COPILOT_DAILY_BUDGET_USD;
    expect(dailyBudgetUsd()).toBe(5);
  });

  it("reads a configured limit", () => {
    process.env.COPILOT_DAILY_BUDGET_USD = "12.5";
    expect(dailyBudgetUsd()).toBe(12.5);
  });

  it("falls back to the default for junk or non-positive values", () => {
    for (const bad of ["", "abc", "0", "-3"]) {
      process.env.COPILOT_DAILY_BUDGET_USD = bad;
      expect(dailyBudgetUsd()).toBe(5);
    }
  });
});

describe("getDailyBudgetStatus", () => {
  it("reports spend under the cap as not exceeded", async () => {
    process.env.COPILOT_DAILY_BUDGET_USD = "5";
    const status = await getDailyBudgetStatus(dbReturning("0.548197"));
    expect(status.exceeded).toBe(false);
    expect(status.spentTodayUsd).toBeCloseTo(0.548197);
    expect(status.remainingUsd).toBeCloseTo(4.451803);
  });

  it("treats spend exactly at the cap as exceeded", async () => {
    process.env.COPILOT_DAILY_BUDGET_USD = "5";
    const status = await getDailyBudgetStatus(dbReturning("5"));
    expect(status.exceeded).toBe(true);
    expect(status.remainingUsd).toBe(0);
  });

  it("never reports negative remaining budget once over", async () => {
    process.env.COPILOT_DAILY_BUDGET_USD = "5";
    const status = await getDailyBudgetStatus(dbReturning("7.25"));
    expect(status.exceeded).toBe(true);
    expect(status.remainingUsd).toBe(0);
  });

  it("handles a day with no runs at all", async () => {
    process.env.COPILOT_DAILY_BUDGET_USD = "5";
    const status = await getDailyBudgetStatus(dbReturning("0"));
    expect(status.spentTodayUsd).toBe(0);
    expect(status.exceeded).toBe(false);
  });
});
