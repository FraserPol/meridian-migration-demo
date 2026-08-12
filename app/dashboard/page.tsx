import Link from "next/link";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { profiles, watchlistItems } from "@/lib/db/schema";

// Reads the session cookie and does a live, per-user DB read — request-time
// by design. See next.config.ts.
export const instant = false;

export default async function DashboardPage() {
  const hdrs = await headers();
  const session = await getSession(hdrs);
  const db = await getDb(hdrs);

  // Independent queries — run in parallel rather than sequentially
  // awaited, so the page isn't waiting on two round trips back to back.
  const [[profile], items] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.userId, session!.userId)).limit(1),
    db.select().from(watchlistItems).where(eq(watchlistItems.userId, session!.userId)),
  ]);

  return (
    <>
      <h1>Welcome back{profile ? `, ${profile.displayName.split(" ")[0]}` : ""}</h1>

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
    </>
  );
}
