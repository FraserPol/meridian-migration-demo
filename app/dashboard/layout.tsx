import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  getSession,
  destroySession,
  VaultUnavailableError,
  VAULT_UNAVAILABLE_MESSAGE,
} from "@/lib/session";

// Reads the session cookie to gate the whole dashboard — request-time by
// design. See next.config.ts.
export const instant = false;

async function signOutAction() {
  "use server";
  await destroySession();
  redirect("/login");
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await getSession(await headers());
  } catch (err) {
    if (err instanceof VaultUnavailableError) {
      // Not covered by proxy.ts's own catch of the same error class — this
      // layout re-verifies the session independently, so it needs to
      // handle a Vault outage in that window too rather than crashing to
      // the generic error boundary (see lib/session.ts).
      return (
        <main className="page">
          <p>{VAULT_UNAVAILABLE_MESSAGE}</p>
        </main>
      );
    }
    throw err;
  }
  if (!session) redirect("/login");

  return (
    <>
      <nav className="nav">
        <Link href="/dashboard" className="brand">
          Meridian Capital
        </Link>
        <div className="nav-links">
          <Link href="/dashboard/watchlist">Watchlist</Link>
          <Link href="/dashboard/profile">Profile</Link>
          <span style={{ color: "var(--muted)" }}>{session.email}</span>
          <form action={signOutAction}>
            <button type="submit" className="secondary">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      <main className="page">{children}</main>
    </>
  );
}
