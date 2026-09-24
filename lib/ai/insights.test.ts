import { describe, it, expect } from "vitest";
import { fingerprintPortfolio, type InsightInput } from "./insights";
import type { PortfolioSummary, PositionValue } from "@/lib/portfolio";

/**
 * The fingerprint is what makes the insight cache correct: too loose and
 * a customer reads advice about a portfolio they no longer hold, too
 * tight and every page view bills a model call. Both failures are
 * invisible in the UI, which is why they're pinned down here.
 */
function position(ticker: string, quantity: number, costBasis: number): PositionValue {
  const marketValue = quantity * costBasis * 1.1;
  return {
    ticker,
    quantity,
    costBasis,
    marketValue,
    cost: quantity * costBasis,
    gainUsd: marketValue - quantity * costBasis,
    gainPct: 10,
  };
}

function input(overrides: Partial<InsightInput> = {}): InsightInput {
  const positions = overrides.summary?.positions ?? [position("AAPL", 40, 198.2)];
  const summary: PortfolioSummary = {
    positions,
    totalValue: 8720.8,
    totalCost: 7928,
    totalGainUsd: 792.8,
    totalGainPct: 10,
    dayChangeUsd: 12,
    best: { ticker: "AAPL", changePct: 1 },
    worst: { ticker: "AAPL", changePct: 1 },
    ...overrides.summary,
  };
  return {
    riskTolerance: "balanced",
    investmentGoal: "Long-term growth",
    watchingOnly: ["MSFT"],
    ...overrides,
    summary,
  };
}

describe("fingerprintPortfolio", () => {
  it("is stable for the same portfolio", () => {
    expect(fingerprintPortfolio(input())).toBe(fingerprintPortfolio(input()));
  });

  it("changes when a position's size changes", () => {
    const more = input({
      summary: { positions: [position("AAPL", 41, 198.2)] } as PortfolioSummary,
    });
    expect(fingerprintPortfolio(more)).not.toBe(fingerprintPortfolio(input()));
  });

  it("changes when the cost basis changes", () => {
    const cheaper = input({
      summary: { positions: [position("AAPL", 40, 150)] } as PortfolioSummary,
    });
    expect(fingerprintPortfolio(cheaper)).not.toBe(fingerprintPortfolio(input()));
  });

  it("changes when risk tolerance changes", () => {
    expect(fingerprintPortfolio(input({ riskTolerance: "aggressive" }))).not.toBe(
      fingerprintPortfolio(input()),
    );
  });

  it("changes when a new ticker is watched", () => {
    expect(fingerprintPortfolio(input({ watchingOnly: ["MSFT", "TSLA"] }))).not.toBe(
      fingerprintPortfolio(input()),
    );
  });

  it("ignores the order positions and watched tickers arrive in", () => {
    const a = input({
      summary: {
        positions: [position("AAPL", 40, 198.2), position("TSLA", 5, 200)],
      } as PortfolioSummary,
      watchingOnly: ["MSFT", "NVDA"],
    });
    const b = input({
      summary: {
        positions: [position("TSLA", 5, 200), position("AAPL", 40, 198.2)],
      } as PortfolioSummary,
      watchingOnly: ["NVDA", "MSFT"],
    });
    expect(fingerprintPortfolio(a)).toBe(fingerprintPortfolio(b));
  });

  it("does not change when only the market price moves", () => {
    // Prices tick constantly; including them would miss the cache on
    // every page view and bill a model call each time.
    const base = input();
    const moved = input();
    moved.summary.totalValue = 99999;
    moved.summary.positions[0].marketValue = 99999;
    moved.summary.positions[0].gainPct = 480;
    expect(fingerprintPortfolio(moved)).toBe(fingerprintPortfolio(base));
  });
});
