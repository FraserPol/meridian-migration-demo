/**
 * Deterministic mock quote generator — shared by app/api/quotes/route.ts
 * (the "existing AWS-hosted market-data API" boundary the browser calls
 * directly) and app/dashboard/watchlist/page.tsx (server-rendered initial
 * state, computed in-process to avoid a same-origin self-fetch on first
 * paint). See app/api/quotes/route.ts for the full rationale.
 */
export type Quote = {
  ticker: string;
  price: number;
  changePct: number;
  /** Oldest-first closing prices, for the sparkline in the watchlist. */
  history: number[];
};

/** Trading days of history returned with each quote. */
const HISTORY_DAYS = 30;

const BASE_PRICES: Record<string, number> = {
  AAPL: 227.5,
  MSFT: 418.2,
  TSLA: 255.1,
  NVDA: 178.3,
  GOOGL: 192.4,
  AMZN: 224.1,
  META: 612.8,
  NFLX: 890.4,
};

function seededOffset(ticker: string, daySeed: number): number {
  let hash = daySeed;
  for (let i = 0; i < ticker.length; i++) {
    hash = (hash * 31 + ticker.charCodeAt(i)) % 100000;
  }
  return (hash % 800) / 100 - 4; // roughly -4% to +4%
}

/** The same seed the rest of this file uses, for a given calendar date. */
function daySeedFor(date: Date): number {
  return Number(date.toISOString().slice(0, 10).replace(/-/g, ""));
}

function priceOn(ticker: string, date: Date): number {
  const base = BASE_PRICES[ticker] ?? 100;
  return Math.max(1, base * (1 + seededOffset(ticker, daySeedFor(date)) / 100));
}

export function computeQuotes(tickers: string[]): Quote[] {
  const today = new Date();
  return tickers.map((raw) => {
    const ticker = raw.toUpperCase();
    const pctChange = seededOffset(ticker, daySeedFor(today));
    const price = priceOn(ticker, today);

    // Re-derives each past day from the same seeded function rather than
    // storing a series, so history stays consistent with whatever
    // computeQuotes() reports for that day — the mock has no storage, and
    // a sparkline that disagreed with the price above it would be worse
    // than no sparkline.
    const history: number[] = [];
    for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 0; daysAgo--) {
      const day = new Date(today);
      day.setUTCDate(day.getUTCDate() - daysAgo);
      history.push(Number(priceOn(ticker, day).toFixed(2)));
    }

    return {
      ticker,
      price: Number(price.toFixed(2)),
      changePct: Number(pctChange.toFixed(2)),
      history,
    };
  });
}

export const KNOWN_TICKERS = Object.keys(BASE_PRICES);
