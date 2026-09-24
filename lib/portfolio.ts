import type { Quote } from "@/lib/quotes";

/**
 * Portfolio arithmetic for the watchlist summary. Pure functions over
 * already-fetched rows and quotes — no database, no I/O — so the numbers
 * on the dashboard and the numbers on the watchlist come from one
 * implementation instead of two that drift.
 */

export type Holding = {
  ticker: string;
  /** Null when the row is a pure watch rather than a position held. */
  quantity: string | null;
  costBasis: string | null;
};

export type PositionValue = {
  ticker: string;
  quantity: number;
  costBasis: number;
  marketValue: number;
  cost: number;
  gainUsd: number;
  gainPct: number;
};

export type PortfolioSummary = {
  /** Positions with both a quantity and a cost basis. */
  positions: PositionValue[];
  totalValue: number;
  totalCost: number;
  totalGainUsd: number;
  totalGainPct: number;
  /** Today's movement in dollars, weighted by position size. */
  dayChangeUsd: number;
  best?: { ticker: string; changePct: number };
  worst?: { ticker: string; changePct: number };
};

function positionOf(holding: Holding, quote: Quote | undefined): PositionValue | null {
  if (!quote || holding.quantity === null || holding.costBasis === null) return null;
  const quantity = Number(holding.quantity);
  const costBasis = Number(holding.costBasis);
  // Both must be positive. A zero or negative cost basis isn't just
  // meaningless for a percentage return — it would report the position's
  // entire market value as profit and inflate the portfolio total.
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(costBasis) || costBasis <= 0) return null;

  const marketValue = quantity * quote.price;
  const cost = quantity * costBasis;
  const gainUsd = marketValue - cost;

  return {
    ticker: holding.ticker,
    quantity,
    costBasis,
    marketValue,
    cost,
    gainUsd,
    gainPct: (gainUsd / cost) * 100,
  };
}

export function summarizePortfolio(
  holdings: Holding[],
  quotes: Map<string, Quote>,
): PortfolioSummary {
  const positions = holdings
    .map((h) => positionOf(h, quotes.get(h.ticker)))
    .filter((p): p is PositionValue => p !== null);

  const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const totalCost = positions.reduce((sum, p) => sum + p.cost, 0);
  const totalGainUsd = totalValue - totalCost;

  // Day change counts only held positions: a percentage move on a ticker
  // you own nothing of moves no money.
  const dayChangeUsd = positions.reduce((sum, p) => {
    const quote = quotes.get(p.ticker);
    if (!quote) return sum;
    const previousClose = quote.price / (1 + quote.changePct / 100);
    return sum + (quote.price - previousClose) * p.quantity;
  }, 0);

  // Best/worst spans the whole watchlist, held or not — that's the part
  // someone scans for, and an unheld ticker moving 4% is still the news.
  const ranked = holdings
    .map((h) => quotes.get(h.ticker))
    .filter((q): q is Quote => q !== undefined)
    .sort((a, b) => b.changePct - a.changePct);

  return {
    positions,
    totalValue,
    totalCost,
    totalGainUsd,
    totalGainPct: totalCost > 0 ? (totalGainUsd / totalCost) * 100 : 0,
    dayChangeUsd,
    best: ranked.length ? { ticker: ranked[0].ticker, changePct: ranked[0].changePct } : undefined,
    worst: ranked.length
      ? { ticker: ranked[ranked.length - 1].ticker, changePct: ranked[ranked.length - 1].changePct }
      : undefined,
  };
}
