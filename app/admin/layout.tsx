import { redirect } from "next/navigation";
import { getSession, destroySession } from "@/lib/session";

// Reads the session cookie to gate the admin area — request-time by
// design. See next.config.ts.
export const instant = false;

async function signOutAction() {
  "use server";
  await destroySession();
  redirect("/login");
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/login");

  return (
    <>
      <nav className="nav">
        <span className="brand">Meridian Capital — IT Platform Admin</span>
        <div className="nav-links">
          <span className="badge">Admin</span>
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
