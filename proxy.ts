import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequestCookie, SessionUnavailableError, SESSION_COOKIE } from "@/lib/session";

// Next.js 16 renamed the `middleware.ts` convention to `proxy.ts` to
// clarify this file's role as a network-boundary/routing layer. It now
// always runs on the Node.js runtime (no more Edge runtime option),
// which is why lib/session.ts's Edge-safe/Node-only split (jose here,
// bcryptjs kept out) is no longer strictly required for this file to
// build — it's kept anyway since it's still good separation of concerns
// and costs nothing.
export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  let session;
  try {
    session = await getSessionFromRequestCookie(token, request.headers);
  } catch (err) {
    if (err instanceof SessionUnavailableError) {
      // Vault is unreachable, so we genuinely don't know if this session
      // is valid — that's different from "not signed in" and must not be
      // handled the same way (see lib/session.ts). Say so plainly instead
      // of silently redirecting a possibly-still-valid session to /login.
      return new NextResponse(
        "Session verification is temporarily unavailable. Please try again shortly.",
        { status: 503, headers: { "Retry-After": "30" } },
      );
    }
    throw err;
  }

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
