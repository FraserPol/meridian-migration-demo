"use client";

import { useState } from "react";
import type { Quote } from "@/lib/quotes";

/**
 * A real, visible network hop from the browser to app/api/quotes — the
 * mocked "existing AWS-hosted market-data API" boundary. Open devtools'
 * Network tab while clicking this during the demo to show it crossing
 * the boundary live.
 */
export function RefreshQuotesButton({ tickers }: { tickers: string[] }) {
  const [loading, setLoading] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);

  async function refresh() {
    if (tickers.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/quotes?tickers=${tickers.join(",")}`);
      const data: { quotes: Quote[]; asOf: string } = await res.json();
      for (const quote of data.quotes) {
        const cellPrice = document.querySelector(
          `[data-ticker-row="${quote.ticker}"] [data-field="price"]`,
        );
        const cellChange = document.querySelector(
          `[data-ticker-row="${quote.ticker}"] [data-field="change"]`,
        );
        if (cellPrice) cellPrice.textContent = `$${quote.price.toFixed(2)}`;
        if (cellChange) {
          cellChange.textContent = `${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}%`;
          cellChange.className = quote.changePct >= 0 ? "up" : "down";
        }
      }
      setAsOf(data.asOf);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {asOf && (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          Refreshed {new Date(asOf).toLocaleTimeString()}
        </span>
      )}
      <button className="secondary" onClick={refresh} disabled={loading}>
        {loading ? "Refreshing..." : "Refresh quotes"}
      </button>
    </div>
  );
}
