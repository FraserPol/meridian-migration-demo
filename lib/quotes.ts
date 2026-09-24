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

/**
 * Per-day drift for the history walk, roughly -1.5% to +1.5%.
 *
 * Deliberately not seededOffset(): that hashes each date independently, so
 * consecutive days are uncorrelated and a 30-point series comes out as
 * noise rather than anything resembling a price. This is the step of a
 * walk, applied cumulatively below.
 */
function dailyDrift(ticker: string, date: Date): number {
  let hash = daySeedFor(date);
  for (let i = 0; i < ticker.length; i++) {
    hash = (hash * 131 + ticker.charCodeAt(i) * 17) % 99991;
  }
  return ((hash % 300) / 100 - 1.5) / 100;
}

function priceOn(ticker: string, date: Date): number {
  const base = BASE_PRICES[ticker] ?? 100;
  return Math.max(1, base * (1 + seededOffset(ticker, daySeedFor(date)) / 100));
}

/**
 * Builds the sparkline series backwards from today, so the newest point is
 * exactly the price shown beside it and the one before it is exactly the
 * previous close that `changePct` implies — the same figure
 * summarizePortfolio() derives the day's movement from. Earlier days walk
 * back from there with small cumulative drift.
 */
function historyFor(ticker: string, today: Date, todayPrice: number, changePct: number): number[] {
  const previousClose = todayPrice / (1 + changePct / 100);
  const series = [previousClose, todayPrice];

  let cursor = previousClose;
  for (let daysAgo = 2; daysAgo < HISTORY_DAYS; daysAgo++) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - daysAgo);
    // Walking into the past, so the drift is removed rather than applied.
    cursor = Math.max(1, cursor / (1 + dailyDrift(ticker, day)));
    series.unshift(cursor);
  }

  return series.map((v) => Number(v.toFixed(2)));
}

export function computeQuotes(tickers: string[]): Quote[] {
  const today = new Date();
  return tickers.map((raw) => {
    const ticker = raw.toUpperCase();
    const pctChange = seededOffset(ticker, daySeedFor(today));
    const price = priceOn(ticker, today);

    return {
      ticker,
      price: Number(price.toFixed(2)),
      changePct: Number(pctChange.toFixed(2)),
      history: historyFor(ticker, today, price, pctChange),
    };
  });
}

export const KNOWN_TICKERS = Object.keys(BASE_PRICES);
