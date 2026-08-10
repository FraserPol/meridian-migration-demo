import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";
import { getSession } from "@/lib/session";
import { migrationCopilotTools } from "@/lib/ai/tools";
import { MIGRATION_COPILOT_SYSTEM_PROMPT } from "@/lib/ai/prompts";

// Fluid Compute: this route can sit idle across multiple tool-calling
// steps while waiting on model/tool round-trips. maxDuration bounds a
// single invocation; Fluid Compute means we're billed for active CPU
// during that window, not idle wall-clock time waiting on the model.
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    // The Migration Copilot is scoped to the legacy IT admin persona.
    // Enforced again here (not just in middleware) because this route
    // could be called directly.
    return new Response("Forbidden", { status: 403 });
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    // AI SDK auto-detects the AI Gateway from the "creator/model" string.
    // On Vercel this authenticates via the project's OIDC token
    // automatically (see solution-architecture.md); locally it falls back
    // to AI_GATEWAY_API_KEY from .env.local.
    model: "anthropic/claude-sonnet-4.5",
    system: MIGRATION_COPILOT_SYSTEM_PROMPT,
    messages: convertToModelMessages(messages),
    tools: migrationCopilotTools,
    // Cap tool-calling loops: inventory lookup -> strategy -> config is
    // 3 steps; allow headroom for follow-up questions in the same turn.
    stopWhen: stepCountIs(8),
    providerOptions: {
      gateway: {
        // Provider-level failover for this same model: if the primary
        // serving provider degrades, AI Gateway routes to the next one in
        // this list with no code change and no re-issued API keys — the
        // "provider flexibility and failover" primitive called out in
        // solution-architecture.md Section 4.
        //
        // NOTE: @ai-sdk/gateway@1.0.41 (the version resolvable at build
        // time) only exposes `order`/`only` for providers serving the
        // *same* model, not the cross-model `models: [...]` fallback list
        // shown in some AI Gateway docs/blog posts — that's a newer
        // capability than what's on npm as of this build. See README.md
        // "Known limitations" for how this was verified and what to
        // upgrade once a newer @ai-sdk/gateway is published.
        order: ["bedrock", "anthropic"],
        // Cost/run attribution: tag every request so Finance can see
        // Migration Copilot spend as its own line item in the AI Gateway
        // observability dashboard, separate from any other AI feature.
        user: session.email,
        tags: ["migration-copilot", "admin-tool"],
      } satisfies GatewayProviderOptions,
    },
  });

  return result.toUIMessageStreamResponse();
}
