import { NextResponse } from "next/server";
import { getSession, SessionUnavailableError, sessionUnavailableResponse } from "@/lib/session";
import { getLegacyRouteInventory } from "@/lib/legacy-inventory";

/**
 * Exposes the mocked legacy route inventory as a real endpoint (admin-only)
 * so it's independently curl-able/demoable, separate from the Migration
 * Copilot's tool-calling code path (lib/ai/tools.ts calls the same cached
 * helper directly rather than looping back through HTTP — see the comment
 * there for why). In production this would be the actual AWS-hosted
 * inventory source both paths read from.
 *
 * The auth check below is a runtime/session read, so it can't itself sit
 * behind "use cache" — only the data lookup it gates does (see
 * lib/legacy-inventory.ts).
 */
export async function GET(req: Request) {
  let session;
  try {
    session = await getSession(req.headers);
  } catch (err) {
    if (err instanceof SessionUnavailableError) return sessionUnavailableResponse();
    throw err;
  }
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const routes = await getLegacyRouteInventory();
  return NextResponse.json({ routes });
}
