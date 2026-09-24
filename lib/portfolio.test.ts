import { describe, it, expect } from "vitest";
import type { Quote } from "./quotes";
import { summarizePortfolio, type Holding } from "./portfolio";
import { evaluateAlert, evaluateAlerts } from "./alerts";

/**
 * The summary strip is the first thing on the dashboard and the watchlist,
 * so its arithmetic is the most-read output in the customer-facing half of
 * the app. Wrong numbers here look authoritative rather than broken, which
 * is the argument for pinning the edge cases down.
 */
function quote(ticker: string, price: number, changePct = 0): Quote {
  return { ticker, price, changePct, history: [price, price] };
}

function quotes(...qs: Quote[]): Map<string, Quote> {
  return new Map(qs.map((q) => [q.ticker, q]));
}

const held = (ticker: string, quantity: string, costBasis: string): Holding => ({
  ticker,
  quantity,
  costBasis,
});
const watched = (ticker: string): Holding => ({ ticker, quantity: null, costBasis: null });

describe("summarizePortfolio", () => {
  it("values a held position and its return", () => {
    const s = summarizePortfolio([held("AAPL", "10", "200.00")], quotes(quote("AAPL", 220)));
    expect(s.positions).toHaveLength(1);
    expect(s.totalValue).toBe(2200);
    expect(s.totalCost).toBe(2000);
    expect(s.totalGainUsd).toBe(200);
    expect(s.totalGainPct).toBeCloseTo(10);
  });

  it("ignores watch-only rows in the totals", () => {
    const s = summarizePortfolio(
      [held("AAPL", "10", "200.00"), watched("TSLA")],
      quotes(quote("AAPL", 220), quote("TSLA", 255)),
    );
    expect(s.positions.map((p) => p.ticker)).toEqual(["AAPL"]);
    expect(s.totalValue).toBe(2200);
  });

  it("still ranks movers across watch-only rows", () => {
    const s = summarizePortfolio(
      [held("AAPL", "10", "200.00"), watched("TSLA")],
      quotes(quote("AAPL", 220, 1.5), quote("TSLA", 255, 4.2)),
    );
    expect(s.best?.ticker).toBe("TSLA");
    expect(s.worst?.ticker).toBe("AAPL");
  });

  it("derives day change from the previous close, weighted by size", () => {
    // +10% today means the previous close was 200; 10 shares => +$200.
    const s = summarizePortfolio([held("AAPL", "10", "150.00")], quotes(quote("AAPL", 220, 10)));
    expect(s.dayChangeUsd).toBeCloseTo(200, 6);
  });

  it("reports a loss as negative rather than absolute", () => {
    const s = summarizePortfolio([held("AAPL", "5", "300.00")], quotes(quote("AAPL", 220)));
    expect(s.totalGainUsd).toBeCloseTo(-400);
    expect(s.totalGainPct).toBeCloseTo(-26.6667, 3);
  });

  it("skips rows with only half a position recorded", () => {
    const s = summarizePortfolio(
      [{ ticker: "AAPL", quantity: "10", costBasis: null }],
      quotes(quote("AAPL", 220)),
    );
    expect(s.positions).toHaveLength(0);
    expect(s.totalValue).toBe(0);
  });

  it("skips a position whose ticker has no quote", () => {
    const s = summarizePortfolio([held("ZZZZ", "10", "10.00")], quotes(quote("AAPL", 220)));
    expect(s.positions).toHaveLength(0);
    expect(s.best).toBeUndefined();
  });

  it("does not divide by zero on a zero cost basis", () => {
    const s = summarizePortfolio([held("AAPL", "10", "0")], quotes(quote("AAPL", 220)));
    expect(s.positions).toHaveLength(0);
    expect(Number.isFinite(s.totalGainPct)).toBe(true);
  });

  it("handles an empty watchlist", () => {
    const s = summarizePortfolio([], quotes());
    expect(s.totalValue).toBe(0);
    expect(s.totalGainPct).toBe(0);
    expect(s.best).toBeUndefined();
  });
});

describe("evaluateAlert", () => {
  const q = quotes(quote("AAPL", 220));

  it("fires a below alert when price is under the threshold", () => {
    const a = evaluateAlert({ id: "1", ticker: "AAPL", direction: "below", threshold: "230" }, q);
    expect(a.triggered).toBe(true);
  });

  it("does not fire a below alert when price is above it", () => {
    const a = evaluateAlert({ id: "1", ticker: "AAPL", direction: "below", threshold: "210" }, q);
    expect(a.triggered).toBe(false);
  });

  it("fires at exactly the threshold, in both directions", () => {
    const below = evaluateAlert(
      { id: "1", ticker: "AAPL", direction: "below", threshold: "220" },
      q,
    );
    const above = evaluateAlert(
      { id: "2", ticker: "AAPL", direction: "above", threshold: "220" },
      q,
    );
    expect(below.triggered).toBe(true);
    expect(above.triggered).toBe(true);
  });

  it("stays dormant when the ticker has no quote", () => {
    const a = evaluateAlert({ id: "1", ticker: "ZZZZ", direction: "below", threshold: "999" }, q);
    expect(a.triggered).toBe(false);
    expect(a.currentPrice).toBeUndefined();
  });

  it("sorts triggered alerts to the top", () => {
    const list = evaluateAlerts(
      [
        { id: "dormant", ticker: "AAPL", direction: "above", threshold: "500" },
        { id: "fired", ticker: "AAPL", direction: "below", threshold: "230" },
      ],
      q,
    );
    expect(list[0].id).toBe("fired");
  });
});
