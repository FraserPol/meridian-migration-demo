import { convertToModelMessages, createUIMessageStreamResponse, type UIMessage } from "ai";
import { start } from "workflow/api";
import { getSession } from "@/lib/session";
import { migrationCopilotWorkflow } from "@/workflows/migration-copilot/workflow";

// Fluid Compute: this route itself returns almost immediately after
// start()ing the workflow and piping back its stream — the actual
// tool-calling loop now runs as a durable workflow run (see
// workflows/migration-copilot/workflow.ts), not inside this Function
// invocation. maxDuration still bounds how long this route will keep
// piping the response stream to the client.
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getSession(req.headers);
  if (!session || session.role !== "admin") {
    // The Migration Copilot is scoped to the legacy IT admin persona.
    // Enforced again here (not just in middleware/proxy) because this
    // route could be called directly.
    return new Response("Forbidden", { status: 403 });
  }

  const { messages }: { messages: UIMessage[] } = await req.json();
  const modelMessages = await convertToModelMessages(messages);

  // Per-request data (which admin is asking, for AI Gateway spend
  // attribution) is passed as a plain workflow argument — DurableAgent
  // has no callOptionsSchema/prepareCall equivalent, so it's set directly
  // in providerOptions.gateway inside the workflow function.
  const run = await start(migrationCopilotWorkflow, [modelMessages, session.email]);

  return createUIMessageStreamResponse({ stream: run.readable });
}
