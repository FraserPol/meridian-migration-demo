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

// Static shell: the nav frame and its "IT Platform Admin" label don't
// depend on who's signed in, so — same split already applied to
// dashboard/layout.tsx — nothing here reads `headers()` and the frame can
// prerender once and stream from cache. The two things that *are*
// per-request — the admin-only auth gate and the signed-in user's
// email/badge — are pushed into their own Suspense boundaries below
// instead of the old `export const instant = false`, which forced the
// entire admin area (nav included) to block on a live Vault session
// lookup before rendering anything.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="nav">
        <span className="brand">Meridian Capital — IT Platform Admin</span>
        <div className="nav-links">
          <Suspense fallback={null}>
            <AdminNavSlice />
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

// Gates the admin body on a valid admin session — request-time by design,
// same as before, just isolated to this boundary so it no longer forces
// the nav shell above into the dynamic hole with it.
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
  if (!session || session.role !== "admin") redirect("/login");
  return <>{children}</>;
}

// Independent session read for just the nav's badge/email/sign-out
// slice — this boundary resolves separately from AuthGate above (sibling
// Suspense boundaries have no ordering guarantee), so it can't rely on
// AuthGate having already verified anything and mints its own Vault-backed
// check, same pattern as dashboard/layout.tsx's UserNavSlice.
async function AdminNavSlice() {
  let session;
  try {
    session = await getSession(await headers());
  } catch {
    return null;
  }
  if (!session || session.role !== "admin") return null;
  return (
    <>
      <span className="badge">Admin</span>
      <span className="nav-email">{session.email}</span>
      <form action={signOutAction}>
        <button type="submit" className="secondary">
          Sign out
        </button>
      </form>
    </>
  );
}
