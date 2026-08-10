import Link from "next/link";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { profiles, watchlistItems } from "@/lib/db/schema";

export default async function DashboardPage() {
  const session = await getSession();
  const db = await getDb();

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, session!.userId))
    .limit(1);

  const items = await db
    .select()
    .from(watchlistItems)
    .where(eq(watchlistItems.userId, session!.userId));

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
