import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession, destroySession } from "@/lib/session";

// Reads the session cookie to gate the whole dashboard — request-time by
// design. See next.config.ts.
export const instant = false;

async function signOutAction() {
  "use server";
  await destroySession();
  redirect("/login");
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession(await headers());
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
