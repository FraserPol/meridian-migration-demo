import { NextResponse } from "next/server";
import { convertToModelMessages, createUIMessageStreamResponse, type UIMessage } from "ai";
import { createModelCallToUIChunkTransform } from "@ai-sdk/workflow";
import { start } from "workflow/api";
import { getSession, SessionUnavailableError, sessionUnavailableResponse } from "@/lib/session";
import { getDb } from "@/lib/db";
import { getDailyBudgetStatus } from "@/lib/ai/budget";
import { migrationCopilotWorkflow } from "@/workflows/migration-copilot/workflow";

// Fluid Compute: this route itself returns almost immediately after
// start()ing the workflow and piping back its stream — the actual
// tool-calling loop now runs as a durable workflow run (see
// workflows/migration-copilot/workflow.ts), not inside this Function
// invocation. maxDuration still bounds how long this route will keep
// piping the response stream to the client.
export const maxDuration = 60;

export async function POST(req: Request) {
  let session;
  try {
    session = await getSession(req.headers);
  } catch (err) {
    if (err instanceof SessionUnavailableError) return sessionUnavailableResponse();
    throw err;
  }
  if (!session || session.role !== "admin") {
    // The Migration Copilot is scoped to the legacy IT admin persona.
    // Enforced again here (not just in middleware/proxy) because this
    // route could be called directly.
    return new Response("Forbidden", { status: 403 });
  }

  // Spend guardrail, checked before the run starts rather than after it
  // bills: the audit trail makes cost visible, this is what actually stops
  // it. A Vault blip here shouldn't take the Copilot down, so an
  // unavailable database fails open on the budget check specifically —
  // getSession() above has already established this is a real admin.
  try {
    const budget = await getDailyBudgetStatus(await getDb(req.headers));
    if (budget.exceeded) {
      return NextResponse.json(
        {
          error: `Daily Migration Copilot budget reached: $${budget.spentTodayUsd.toFixed(2)} of $${budget.limitUsd.toFixed(2)} spent. Runs resume at 00:00 UTC, or raise COPILOT_DAILY_BUDGET_USD.`,
        },
        { status: 429 },
      );
    }
  } catch (err) {
    if (err instanceof SessionUnavailableError) return sessionUnavailableResponse();
    throw err;
  }

  const {
    messages,
    simulateFailover,
  }: { messages: UIMessage[]; simulateFailover?: boolean } = await req.json();
  const modelMessages = await convertToModelMessages(messages);

  // Per-request data (which admin is asking, for AI Gateway spend
  // attribution) is passed as a plain workflow argument and set directly
  // in providerOptions.gateway inside the workflow function (it has to be
  // known before the step-up classifier picks the model, so WorkflowAgent's
  // prepareCall wouldn't simplify this). The OIDC
  // token is passed through too, since the workflow's audit-trail
  // persistence step has no way to read the original request — see
  // workflows/migration-copilot/workflow.ts.
  const oidcToken = req.headers.get("x-vercel-oidc-token");
  const run = await start(migrationCopilotWorkflow, [
    modelMessages,
    session.email,
    oidcToken,
    simulateFailover ?? false,
  ]);

  // The workflow streams raw ModelCallStreamPart chunks (WorkflowAgent's
  // provider-shaped format); convert to the UI message protocol useChat
  // expects here, at the response boundary.
  //
  // x-workflow-run-id is required, not informational: WorkflowChatTransport
  // reads it to know which run to reconnect to, and throws without it. It's
  // what makes a dropped stream (client navigating away, a Function timing
  // out mid-answer) recoverable instead of a lost run — see
  // app/api/chat/[runId]/stream/route.ts.
  return createUIMessageStreamResponse({
    stream: run.readable.pipeThrough(createModelCallToUIChunkTransform()),
    headers: { "x-workflow-run-id": run.runId },
  });
}
