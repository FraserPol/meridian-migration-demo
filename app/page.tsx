import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession, SessionUnavailableError } from "@/lib/session";

// `instant = false` only opts this route out of client-side instant-
// navigation prefetch validation — it does NOT stop the page from being
// statically prerendered. Without the Suspense boundary below, this
// page's *only* output is an unconditional redirect(), which Next.js's
// build treats as a legitimately cacheable static outcome: it prerenders
// the no-session build-time result ("redirect to /login") once and serves
// that identical shell to every visitor afterward, signed in or not —
// confirmed live: a real, valid session cookie still got the cached
// anonymous redirect. Wrapping the session check in <Suspense> forces
// Next.js to treat it as a genuine per-request dynamic hole instead of
// something it can resolve once at build time. See next.config.ts.
export const instant = false;

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <RouteBySession />
    </Suspense>
  );
}

async function RouteBySession() {
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
