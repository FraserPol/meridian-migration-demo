import { createUIMessageStreamResponse } from "ai";
import { createModelCallToUIChunkTransform } from "@ai-sdk/workflow";
import { getRun } from "workflow/api";
import { getSession, SessionUnavailableError, sessionUnavailableResponse } from "@/lib/session";

/**
 * Reconnect endpoint for an in-flight Migration Copilot run.
 *
 * WorkflowChatTransport (see app/admin/migration-copilot/chat-panel.tsx)
 * calls this automatically whenever a POST /api/chat stream ends without a
 * `finish` chunk — a Function hitting maxDuration mid-answer, a dropped
 * connection, a client that navigated away and came back. It reads the run
 * id from the POST's x-workflow-run-id header and resumes from the chunk
 * index it had already consumed, so the answer continues rather than
 * restarting or being lost.
 *
 * This is the client-side half of the failure mode found in production
 * after the WorkflowAgent migration: doStreamStep has maxRetries = 0, and
 * writing to a stream with no reader times out after 30s and fails the
 * whole run. Keeping a reader attached is what avoids that.
 */
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  let session;
  try {
    session = await getSession(req.headers);
  } catch (err) {
    if (err instanceof SessionUnavailableError) return sessionUnavailableResponse();
    throw err;
  }
  if (!session || session.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const { runId } = await params;

  // Negative values read from the end of the stream, so a client that lost
  // its place entirely still gets recent context instead of a full replay.
  const startIndexParam = new URL(req.url).searchParams.get("startIndex");
  const parsed = Number(startIndexParam);
  const startIndex = Number.isFinite(parsed) ? parsed : 0;

  let readable;
  try {
    readable = getRun(runId).getReadable({ startIndex });
  } catch {
    // getRun throws WorkflowRunNotFoundError for an unknown or expired run.
    return new Response("Run not found", { status: 404 });
  }

  return createUIMessageStreamResponse({
    stream: readable.pipeThrough(createModelCallToUIChunkTransform()),
    headers: { "x-workflow-run-id": runId },
  });
}
