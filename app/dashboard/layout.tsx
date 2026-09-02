import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  getSession,
  destroySession,
  VaultUnavailableError,
  VAULT_UNAVAILABLE_MESSAGE,
} from "@/lib/session";

async function signOutAction() {
  "use server";
  await destroySession();
  redirect("/login");
}

// Static shell: the nav frame and its Watchlist/Profile links don't depend
// on who's signed in, so nothing here reads `headers()` and the whole
// component can prerender once and serve from Vercel's Edge in every
// region. The two things that *are* per-request — the auth gate and the
// signed-in user's email — are pushed down into their own Suspense
// boundaries below rather than gating this entire layout the way
// `export const instant = false` used to (see next.config.ts and git
// history on this file for the prior all-dynamic version).
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="nav">
        <Link href="/dashboard" className="brand">
          Meridian Capital
        </Link>
        <div className="nav-links">
          <Link href="/dashboard/watchlist">Watchlist</Link>
          <Link href="/dashboard/profile">Profile</Link>
          <Suspense fallback={null}>
            <UserNavSlice />
          </Suspense>
        </div>
      </nav>
      <main className="page">
        <Suspense fallback={null}>
          <AuthGate>{children}</AuthGate>
        </Suspense>
      </main>
    </>
  );
}

// Gates the dashboard body on a valid session — request-time by design,
// same as before, just isolated to this boundary so it no longer forces
// the nav shell above into the dynamic hole with it. `redirect()` called
// from inside a suspended boundary like this one is handled by Next.js
// the same way it is from a top-level page (see app/page.tsx).
async function AuthGate({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await getSession(await headers());
  } catch (err) {
    if (err instanceof VaultUnavailableError) {
      // Not covered by proxy.ts's own catch of the same error class — this
      // layout re-verifies the session independently, so it needs to
      // handle a Vault outage in that window too rather than crashing to
      // the generic error boundary (see lib/session.ts).
      return <p>{VAULT_UNAVAILABLE_MESSAGE}</p>;
    }
    throw err;
  }
  if (!session) redirect("/login");
  return <>{children}</>;
}

// Independent session read for just the nav's email/sign-out slice — this
// boundary resolves separately from AuthGate above (sibling Suspense
// boundaries have no ordering guarantee), so it can't rely on AuthGate
// having already verified anything and mints its own Vault-backed check,
// same as dashboard/page.tsx already does relative to this layout.
async function UserNavSlice() {
  let session;
  try {
    session = await getSession(await headers());
  } catch {
    return null;
  }
  if (!session) return null;
  return (
    <>
      <span className="nav-email">{session.email}</span>
      <form action={signOutAction}>
        <button type="submit" className="secondary">
          Sign out
        </button>
      </form>
    </>
  );
}
