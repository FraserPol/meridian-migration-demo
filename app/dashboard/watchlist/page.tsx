import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { watchlistItems } from "@/lib/db/schema";
import { computeQuotes } from "@/lib/quotes";
import { AddTickerForm } from "./add-ticker-form";
import { RemoveTickerButton } from "./remove-ticker-button";
import { RefreshQuotesButton } from "./refresh-quotes-button";

// Reads the session cookie and live per-user watchlist + quote data —
// request-time by design. See next.config.ts.
export const instant = false;

export default async function WatchlistPage() {
  const session = await getSession();
  const db = await getDb(await headers());

  const items = await db
    .select()
    .from(watchlistItems)
    .where(eq(watchlistItems.userId, session!.userId));

  const quotes = computeQuotes(items.map((i) => i.ticker));
  const quoteByTicker = new Map(quotes.map((q) => [q.ticker, q]));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Watchlist</h1>
        <RefreshQuotesButton tickers={items.map((i) => i.ticker)} />
      </div>

      <div className="card">
        <h2>Add a ticker</h2>
        <AddTickerForm />
      </div>

      <div className="card">
        <h2>Tracking</h2>
        {items.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>Nothing here yet — add a ticker above.</p>
        ) : (
          <table id="watchlist-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Price</th>
                <th>Change</th>
                <th>Added at</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const quote = quoteByTicker.get(item.ticker);
                return (
                  <tr key={item.id} data-ticker-row={item.ticker}>
                    <td>
                      <strong>{item.ticker}</strong>
                    </td>
                    <td data-field="price">{quote ? `$${quote.price.toFixed(2)}` : "—"}</td>
                    <td className={quote && quote.changePct >= 0 ? "up" : "down"} data-field="change">
                      {quote ? `${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}%` : "—"}
                    </td>
                    <td>{item.addedAtPrice ? `$${item.addedAtPrice}` : "—"}</td>
                    <td>
                      <RemoveTickerButton itemId={item.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 12 }}>
          Quotes are computed server-side on page load, then refreshed live from{" "}
          <code>/api/quotes</code> — the mocked stand-in for Meridian&apos;s existing AWS-hosted
          market-data API — via the button above.
        </p>
      </div>
    </>
  );
}
