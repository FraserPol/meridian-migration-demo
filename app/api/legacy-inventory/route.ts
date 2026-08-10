import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { legacyRouteInventory } from "@/lib/legacy-inventory";

/**
 * Exposes the mocked legacy route inventory as a real endpoint (admin-only)
 * so it's independently curl-able/demoable, separate from the Migration
 * Copilot's tool-calling code path (lib/ai/tools.ts imports the data
 * directly rather than looping back through HTTP — see the comment there
 * for why). In production this would be the actual AWS-hosted inventory
 * source both paths read from.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ routes: legacyRouteInventory });
}
