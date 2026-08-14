import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession, SessionUnavailableError } from "@/lib/session";

// Reads the session cookie to decide where to redirect — inherently
// request-time, not a candidate for a static shell. See next.config.ts.
export const instant = false;

export default async function HomePage() {
  let session;
  try {
    session = await getSession(await headers());
  } catch (err) {
    if (err instanceof SessionUnavailableError) {
      // Not covered by proxy.ts's matcher (root path isn't a protected
      // route), so this page has to handle the outage case itself rather
      // than assuming "no session" means "not signed in."
      return <p>Session verification is temporarily unavailable. Please try again shortly.</p>;
    }
    throw err;
  }
  if (!session) {
    redirect("/login");
  }
  redirect(session.role === "admin" ? "/admin/migration-copilot" : "/dashboard");
}
