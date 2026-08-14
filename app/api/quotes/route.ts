import { NextRequest, NextResponse } from "next/server";
import { getSession, SessionUnavailableError, sessionUnavailableResponse } from "@/lib/session";
import { computeQuotes, KNOWN_TICKERS } from "@/lib/quotes";

/**
 * Stands in for Meridian's existing AWS-hosted market-data API — the
 * system-of-record the app reads quotes from (see AWSVPC/"Internal APIs"
 * in solution-architecture.md's target-state diagram). In production this
 * is reached over Secure Compute with a real vendor behind it; here it's
 * a deterministic mock so the demo is reproducible without a paid data
 * vendor or live AWS account. The browser calls this route directly
 * (visible in devtools as a real network hop), which is the boundary
 * crossing the take-home brief asks for.
 */
export async function GET(req: NextRequest) {
  let session;
  try {
    session = await getSession(req.headers);
  } catch (err) {
    if (err instanceof SessionUnavailableError) return sessionUnavailableResponse();
    throw err;
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tickersParam = req.nextUrl.searchParams.get("tickers");
  const tickers = tickersParam ? tickersParam.split(",").map((t) => t.trim()) : KNOWN_TICKERS;

  const quotes = computeQuotes(tickers);
  return NextResponse.json({ quotes, asOf: new Date().toISOString(), source: "mock-market-data-api" });
}
