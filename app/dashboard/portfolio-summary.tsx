import type { PortfolioSummary } from "@/lib/portfolio";

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function signed(n: number): string {
  return `${n >= 0 ? "+" : "−"}${usd(Math.abs(n))}`;
}

/**
 * Aggregate view across the watchlist. Rendered above the per-row table
 * because "am I up or down today" is the question someone opens this page
 * to answer — the individual rows are the follow-up.
 *
 * Positions and movers are handled separately on purpose: totals only
 * count rows with a real position (shares plus a cost basis), while
 * best/worst spans everything tracked, since an unheld ticker moving
 * sharply is still worth seeing.
 */
export function PortfolioSummaryStrip({ summary }: { summary: PortfolioSummary }) {
  const { positions, totalValue, totalGainUsd, totalGainPct, dayChangeUsd, best, worst } = summary;
  const hasPositions = positions.length > 0;

  return (
    <div className="summary-strip">
      {hasPositions ? (
        <>
          <div className="summary-cell">
            <span className="summary-label">Market value</span>
            <span className="summary-value">{usd(totalValue)}</span>
          </div>
          <div className="summary-cell">
            <span className="summary-label">Today</span>
            <span className={`summary-value ${dayChangeUsd >= 0 ? "up" : "down"}`}>
              {signed(dayChangeUsd)}
            </span>
          </div>
          <div className="summary-cell">
            <span className="summary-label">Total return</span>
            <span className={`summary-value ${totalGainUsd >= 0 ? "up" : "down"}`}>
              {signed(totalGainUsd)}{" "}
              <span className="summary-sub">
                ({totalGainPct >= 0 ? "+" : ""}
                {totalGainPct.toFixed(2)}%)
              </span>
            </span>
          </div>
        </>
      ) : (
        <div className="summary-cell summary-empty">
          <span className="summary-label">Positions</span>
          <span className="summary-value summary-sub">
            Add shares and an average cost to a ticker to track market value and return.
          </span>
        </div>
      )}

      {best && worst && (
        <div className="summary-cell">
          <span className="summary-label">Movers today</span>
          <span className="summary-value summary-movers">
            <span className="up">
              {best.ticker} {best.changePct >= 0 ? "+" : ""}
              {best.changePct.toFixed(2)}%
            </span>
            {best.ticker !== worst.ticker && (
              <span className="down">
                {worst.ticker} {worst.changePct >= 0 ? "+" : ""}
                {worst.changePct.toFixed(2)}%
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
