import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { migrationCopilotRuns } from "@/lib/db/schema";

/**
 * Read-only view onto the audit trail workflows/migration-copilot/workflow.ts
 * writes after every run — see migration_copilot_runs in lib/db/schema.ts.
 * Polled by chat-panel.tsx after each response completes, so cost/tokens/
 * provider are something you can click through live rather than a claim
 * about a dashboard nobody in the room can see (see README's Known
 * limitations for the AI Gateway cost caveat this is turning into a demo).
 *
 * Scoped to the signed-in admin's own runs, most recent first.
 */
export async function GET(req: Request) {
  const session = await getSession(req.headers);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = await getDb(req.headers);
  const runs = await db
    .select()
    .from(migrationCopilotRuns)
    .where(eq(migrationCopilotRuns.adminEmail, session.email))
    .orderBy(desc(migrationCopilotRuns.createdAt))
    .limit(5);

  return NextResponse.json({ runs });
}
