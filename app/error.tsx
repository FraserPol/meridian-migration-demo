"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Catches uncaught errors in any nested route segment (not the root
 * layout itself — see global-error.tsx for that). Previously nonexistent:
 * an unhandled Server Component error showed Next.js's bare default
 * fallback with no branding and nowhere for a user to go but back.
 *
 * console.error here is the honest extent of it — there's no Sentry/
 * Datadog/Log Drain wired up (see README.md's Known Limitations), so this
 * is exactly where that gap is actually felt: a real deployment would
 * forward this server-side, not just log it to whichever browser hit it.
 */
export default function Error({
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
    <main className="page">
      <div className="card">
        <h1>Something went wrong</h1>
        <p style={{ color: "var(--muted)" }}>
          An unexpected error occurred
          {error.digest ? ` (ref: ${error.digest})` : ""}. Try again, or head back to the
          dashboard.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={() => reset()} type="button">
            Try again
          </button>
          <Link href="/">
            <button className="secondary" type="button">
              Go home
            </button>
          </Link>
        </div>
      </div>
    </main>
  );
}
