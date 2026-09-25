import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getSession, VaultUnavailableError, VAULT_UNAVAILABLE_MESSAGE } from "@/lib/session";
import { getDb } from "@/lib/db";
import { profiles, watchlistItems, type Profile, type WatchlistItem } from "@/lib/db/schema";
import { computeQuotes } from "@/lib/quotes";
import { summarizePortfolio } from "@/lib/portfolio";
import { fingerprintPortfolio } from "@/lib/ai/insights";
import { PortfolioSummaryStrip } from "./portfolio-summary";
import { InsightCard } from "./insight-card";
import { latestInsight } from "@/lib/ai/insight-store";
import { PlatformStrip } from "../platform-strip";

// The session-gated DB read is isolated in <DashboardContent> below rather
// than running at this top level, so this page has no unconditional dynamic
// API call of its own — it can prerender a static loading frame instead
// of the whole route falling back to `export const instant = false` (see
// app/dashboard/layout.tsx and next.config.ts for the same split one
// level up).
export default function DashboardPage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--muted)" }}>Loading your dashboard…</p>}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  let profile: Profile | undefined;
  let items: WatchlistItem[];
  let stored: Awaited<ReturnType<typeof latestInsight>> = null;
  try {
    const hdrs = await headers();
    const session = await getSession(hdrs);
    const db = await getDb(hdrs);

    // Independent queries — run in parallel rather than sequentially
    // awaited, so the page isn't waiting on two round trips back to back.
    [[profile], items] = await Promise.all([
      db.select().from(profiles).where(eq(profiles.userId, session!.userId)).limit(1),
      db.select().from(watchlistItems).where(eq(watchlistItems.userId, session!.userId)),
    ]);

    // Needs the quotes and summary below, so it can't join the parallel
    // batch above — but it's a cheap indexed read on a small table.
    const quotesForInsight = computeQuotes(items.map((i) => i.ticker));
    const summaryForInsight = summarizePortfolio(
      items,
      new Map(quotesForInsight.map((q) => [q.ticker, q])),
    );
    if (profile && summaryForInsight.positions.length > 0) {
      const heldTickers = new Set(summaryForInsight.positions.map((p) => p.ticker));
      stored = await latestInsight(
        session!.userId,
        fingerprintPortfolio({
          riskTolerance: profile.riskTolerance,
          investmentGoal: profile.investmentGoal,
          summary: summaryForInsight,
          watchingOnly: items.map((i) => i.ticker).filter((t) => !heldTickers.has(t)),
        }),
        hdrs,
      );
    }
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

  // Same computation the watchlist page uses (lib/portfolio.ts), so the
  // headline numbers here can't drift from the ones a click away.
  const quotes = computeQuotes(items.map((i) => i.ticker));
  const summary = summarizePortfolio(items, new Map(quotes.map((q) => [q.ticker, q])));

  // The insight panel only makes sense once there's a position to talk
  // about and a stated risk tolerance to judge it against.
  const canAdvise = profile !== undefined && summary.positions.length > 0;

  return (
    <>
      <h1>Welcome back{profile ? `, ${profile.displayName.split(" ")[0]}` : ""}</h1>

      {items.length > 0 && <PortfolioSummaryStrip summary={summary} />}

      {/* The AI insight sits in its own column so it reads as commentary
          alongside the account rather than competing with it: profile and
          watchlist are what the customer came for. The grid class is only
          applied when there's actually an insight to show, so a customer
          without positions gets a full-width main column instead of a
          narrowed one beside empty space. Below the breakpoint the aside
          follows the main column, keeping that same priority on mobile. */}
      <div className={canAdvise ? "dashboard-columns" : undefined}>
        <div className="dashboard-main">
          {!profile && (
            <div className="card">
              <h2>Finish setting up your profile</h2>
              <p style={{ color: "var(--muted)" }}>
                You&apos;re signed in, but you haven&apos;t created a profile yet — this is the
                onboarding state the take-home demo intentionally leaves for the{" "}
                <code>alex.chen</code> demo account.
              </p>
              <Link href="/dashboard/profile">
                <button>Create profile</button>
              </Link>
            </div>
          )}

          {profile && (
            <div className="card">
              <h2>Profile</h2>
              <p>
                <strong>{profile.displayName}</strong> · {profile.riskTolerance} risk tolerance
                <br />
                <span style={{ color: "var(--muted)" }}>Goal: {profile.investmentGoal}</span>
              </p>
              <Link href="/dashboard/profile">Edit profile →</Link>
            </div>
          )}

          <div className="card">
            <h2>Watchlist</h2>
            {items.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>
                No tickers yet. <Link href="/dashboard/watchlist">Add your first one →</Link>
              </p>
            ) : (
              <p style={{ color: "var(--muted)" }}>
                Tracking {items.length} ticker{items.length === 1 ? "" : "s"}:{" "}
                {items.map((i) => i.ticker).join(", ")}.{" "}
                <Link href="/dashboard/watchlist">View watchlist →</Link>
              </p>
            )}
          </div>
        </div>

        {canAdvise && (
          <aside className="dashboard-aside">
            <InsightCard
              insight={stored?.insight ?? null}
              createdAt={stored?.createdAt ?? null}
              stale={stored?.stale ?? false}
            />
          </aside>
        )}
      </div>

      <PlatformStrip
        items={[
          "Cache Components (PPR)",
          "AI Gateway",
          "Marketplace Postgres + Drizzle",
          "HCP Vault OIDC",
          "Speed Insights",
        ]}
      />
    </>
  );
}
