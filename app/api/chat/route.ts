import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { getSession } from "@/lib/session";
import { migrationCopilotAgent } from "@/lib/ai/agent";

// Fluid Compute: this route can sit idle across multiple tool-calling
// steps while waiting on model/tool round-trips. maxDuration bounds a
// single invocation; Fluid Compute means we're billed for active CPU
// during that window, not idle wall-clock time waiting on the model.
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

  // The agent itself (model, instructions, tools, stop condition) is
  // defined once in lib/ai/agent.ts and reused here. Per-request data —
  // just the admin's email, for AI Gateway spend attribution — is passed
  // through `options` and merged into providerOptions.gateway by the
  // agent's own `prepareCall` hook.
  return createAgentUIStreamResponse({
    agent: migrationCopilotAgent,
    uiMessages: messages,
    options: { userEmail: session.email },
  });
}
