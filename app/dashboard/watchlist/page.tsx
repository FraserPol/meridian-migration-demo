import { Suspense } from "react";
import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { getSession, VaultUnavailableError, VAULT_UNAVAILABLE_MESSAGE } from "@/lib/session";
import { getDb } from "@/lib/db";
import { priceAlerts, watchlistItems, type PriceAlert, type WatchlistItem } from "@/lib/db/schema";
import { computeQuotes, KNOWN_TICKERS } from "@/lib/quotes";
import { summarizePortfolio } from "@/lib/portfolio";
import { evaluateAlerts } from "@/lib/alerts";
import { PortfolioSummaryStrip } from "../portfolio-summary";
import { AddTickerForm } from "./add-ticker-form";
import { AlertsPanel } from "./alerts-panel";
import { HoldingEditor } from "./holding-editor";
import { Sparkline } from "./sparkline";
import { RemoveTickerButton } from "./remove-ticker-button";
import { RefreshQuotesButton } from "./refresh-quotes-button";

// The session-gated DB read is isolated in <WatchlistContent> below rather
// than running at this top level, so this page has no unconditional
// dynamic API call of its own — it can prerender a static loading frame
// instead of the whole route falling back to `export const instant =
// false` (see app/dashboard/page.tsx for the same split one level up).
export default function WatchlistPage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--muted)" }}>Loading your watchlist…</p>}>
      <WatchlistContent />
    </Suspense>
  );
}

async function WatchlistContent() {
  let items: WatchlistItem[];
  let alerts: PriceAlert[];
  try {
    const hdrs = await headers();
    const session = await getSession(hdrs);
    const db = await getDb(hdrs);

    // Independent reads — issued together rather than awaited back to
    // back, matching the pattern in app/dashboard/page.tsx.
    [items, alerts] = await Promise.all([
      db.select().from(watchlistItems).where(eq(watchlistItems.userId, session!.userId)),
      db
        .select()
        .from(priceAlerts)
        .where(eq(priceAlerts.userId, session!.userId))
        .orderBy(desc(priceAlerts.createdAt)),
    ]);
  } catch (err) {
    if (err instanceof VaultUnavailableError) {
      // getSession()/getDb() each mint their own Vault credential,
      // independently of dashboard/layout.tsx's own getSession() call — a
      // Vault blip here needs the same graceful handling, not a crash to
      // the generic error boundary (see lib/session.ts).
      return <p>{VAULT_UNAVAILABLE_MESSAGE}</p>;
    }
    throw err;
  }

  const quotes = computeQuotes(items.map((i) => i.ticker));
  const quoteByTicker = new Map(quotes.map((q) => [q.ticker, q]));
  const summary = summarizePortfolio(items, quoteByTicker);
  const evaluatedAlerts = evaluateAlerts(alerts, quoteByTicker);
  const positionByTicker = new Map(summary.positions.map((p) => [p.ticker, p]));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Watchlist</h1>
        <RefreshQuotesButton tickers={items.map((i) => i.ticker)} />
      </div>

      {items.length > 0 && <PortfolioSummaryStrip summary={summary} />}

      <AlertsPanel alerts={evaluatedAlerts} tickers={items.map((i) => i.ticker)} />

      <div className="card">
        <h2>Add a ticker</h2>
        <AddTickerForm known={KNOWN_TICKERS} />
      </div>

      <div className="card">
        <h2>Tracking</h2>
        {items.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>Nothing here yet — add a ticker above.</p>
        ) : (
          <div className="table-scroll">
          <table id="watchlist-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Price</th>
                <th>Change</th>
                <th>30d</th>
                <th>Position</th>
                <th>Value</th>
                <th>Return</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const quote = quoteByTicker.get(item.ticker);
                const position = positionByTicker.get(item.ticker);
                return (
                  <tr key={item.id} data-ticker-row={item.ticker}>
                    <td>
                      <strong>{item.ticker}</strong>
                    </td>
                    <td data-field="price">{quote ? `$${quote.price.toFixed(2)}` : "—"}</td>
                    <td className={quote && quote.changePct >= 0 ? "up" : "down"} data-field="change">
                      {quote ? `${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}%` : "—"}
                    </td>
                    <td>
                      {quote ? (
                        <Sparkline
                          values={quote.history}
                          up={quote.history[quote.history.length - 1] >= quote.history[0]}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td data-field="position">
                      {position ? (
                        <>
                          {position.quantity.toLocaleString()} @ ${position.costBasis.toFixed(2)}
                        </>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>Watching</span>
                      )}
                    </td>
                    <td data-field="value">
                      {position
                        ? position.marketValue.toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                          })
                        : "—"}
                    </td>
                    <td
                      data-field="return"
                      className={position ? (position.gainUsd >= 0 ? "up" : "down") : undefined}
                    >
                      {position ? (
                        <>
                          {position.gainUsd >= 0 ? "+" : "−"}$
                          {Math.abs(position.gainUsd).toFixed(2)}
                          <span className="return-pct">
                            {position.gainPct >= 0 ? "+" : ""}
                            {position.gainPct.toFixed(2)}%
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="row-actions">
                      <HoldingEditor
                        itemId={item.id}
                        ticker={item.ticker}
                        quantity={item.quantity}
                        costBasis={item.costBasis}
                      />
                      <RemoveTickerButton itemId={item.id} ticker={item.ticker} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
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
