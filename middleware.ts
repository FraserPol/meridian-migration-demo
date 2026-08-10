import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequestCookie, SESSION_COOKIE } from "@/lib/session";

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};

export default async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getSessionFromRequestCookie(token);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (request.nextUrl.pathname.startsWith("/admin") && session.role !== "admin") {
    // The Migration Copilot is scoped to the legacy IT admin persona by
    // design (see solution-architecture.md Section 3) — customers are
    // redirected back to their own dashboard rather than seeing a 403.
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}
