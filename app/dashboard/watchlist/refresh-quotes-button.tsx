"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Quote } from "@/lib/quotes";

/**
 * A real, visible network hop from the browser to app/api/quotes — the
 * mocked "existing AWS-hosted market-data API" boundary. Open devtools'
 * Network tab while clicking this during the demo to show it crossing
 * the boundary live. The fetched quotes aren't used to paint the table
 * directly — router.refresh() re-renders the page's Server Component with
 * fresh computeQuotes() output instead, so React owns every row here
 * rather than this component reaching past it with
 * document.querySelector + manual textContent/className writes.
 */
export function RefreshQuotesButton({ tickers }: { tickers: string[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);

  async function refresh() {
    if (tickers.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/quotes?tickers=${tickers.join(",")}`);
      const data: { quotes: Quote[]; asOf: string } = await res.json();
      setAsOf(data.asOf);
      router.refresh();
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
