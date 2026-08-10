/**
 * Deterministic mock quote generator — shared by app/api/quotes/route.ts
 * (the "existing AWS-hosted market-data API" boundary the browser calls
 * directly) and app/dashboard/watchlist/page.tsx (server-rendered initial
 * state, computed in-process to avoid a same-origin self-fetch on first
 * paint). See app/api/quotes/route.ts for the full rationale.
 */
export type Quote = { ticker: string; price: number; changePct: number };

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

export function computeQuotes(tickers: string[]): Quote[] {
  const daySeed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""));
  return tickers.map((ticker) => {
    const base = BASE_PRICES[ticker.toUpperCase()] ?? 100;
    const pctChange = seededOffset(ticker.toUpperCase(), daySeed);
    const price = Math.max(1, base * (1 + pctChange / 100));
    return {
      ticker: ticker.toUpperCase(),
      price: Number(price.toFixed(2)),
      changePct: Number(pctChange.toFixed(2)),
    };
  });
}

export const KNOWN_TICKERS = Object.keys(BASE_PRICES);
