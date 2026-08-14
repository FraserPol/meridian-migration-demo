"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Catches errors in the root layout itself (app/layout.tsx) — the one
 * case app/error.tsx can't handle, since that boundary lives *inside* the
 * root layout. Next.js requires this file to render its own <html>/<body>,
 * since it fully replaces the root layout when it's active — including
 * re-importing globals.css, which the replaced layout would otherwise
 * have provided.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="page">
          <div className="card">
            <h1>Something went wrong</h1>
            <p style={{ color: "var(--muted)" }}>
              A critical error occurred
              {error.digest ? ` (ref: ${error.digest})` : ""}. Try again.
            </p>
            <button onClick={() => reset()} type="button" style={{ marginTop: 16 }}>
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
