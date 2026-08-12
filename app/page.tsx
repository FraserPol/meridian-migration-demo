import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";

// Reads the session cookie to decide where to redirect — inherently
// request-time, not a candidate for a static shell. See next.config.ts.
export const instant = false;

export default async function HomePage() {
  const session = await getSession(await headers());
  if (!session) {
    redirect("/login");
  }
  redirect(session.role === "admin" ? "/admin/migration-copilot" : "/dashboard");
}
