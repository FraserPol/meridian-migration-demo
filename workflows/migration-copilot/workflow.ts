import { DurableAgent, type InferDurableAgentUIMessage } from "@workflow/ai/agent";
import { getWritable } from "workflow";
import { stepCountIs, type ModelMessage, type UIMessageChunk } from "ai";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";
import { migrationCopilotTools } from "@/lib/ai/tools";
import { MIGRATION_COPILOT_SYSTEM_PROMPT } from "@/lib/ai/prompts";

/**
 * The Migration Copilot, as a durable Vercel Workflow instead of a plain
 * Route Handler Function (see app/api/chat/route.ts's start() call).
 *
 * Why this exists: the previous implementation ran the whole tool-calling
 * loop (inventory -> strategy -> config) inside a single Function
 * invocation with nothing persisted server-side — a crash or redeploy
 * mid-loop lost everything, and the conversation only ever lived in the
 * browser's useChat state. Each tool's execute function is now a durable
 * step ("use step", see lib/ai/tools.ts) with automatic retries and a
 * result that's persisted and replayed rather than re-executed if this
 * workflow resumes after an interruption. DurableAgent (not the plain
 * ToolLoopAgent used elsewhere in earlier iterations of this file) is
 * what makes each of *its* internal model calls durable too — every
 * "use step" it calls runs as a real step because DurableAgent invokes
 * tools directly from this "use workflow" function's own call stack,
 * not from inside another step. A step calling another step collapses
 * into a single non-durable unit (the "use step" directive becomes a
 * no-op) — this is the whole reason DurableAgent exists instead of a
 * thin wrapper around the plain AI SDK agent.
 */
export async function migrationCopilotWorkflow(messages: ModelMessage[], userEmail: string) {
  "use workflow";

  const agent = new DurableAgent({
    model: "anthropic/claude-sonnet-4.5",
    instructions: MIGRATION_COPILOT_SYSTEM_PROMPT,
    tools: migrationCopilotTools,
  });

  await agent.stream({
    messages,
    writable: getWritable<UIMessageChunk>(),
    // Cap tool-calling loops: inventory lookup -> strategy -> config is 3
    // steps; allow headroom for follow-up questions in the same turn.
    stopWhen: stepCountIs(8),
    providerOptions: {
      gateway: {
        // Provider-level failover for this same model: if the primary
        // serving provider degrades, AI Gateway routes to the next one
        // in this list with no code change and no re-issued API keys —
        // the "provider flexibility and failover" primitive called out
        // in solution-architecture.md Section 4.
        order: ["bedrock", "anthropic"],
        // Cost/run attribution: tag every request so Finance can see
        // Migration Copilot spend as its own line item in the AI
        // Gateway observability dashboard, separate from any other AI
        // feature.
        user: userEmail,
        tags: ["migration-copilot", "admin-tool"],
      } satisfies GatewayProviderOptions,
    },
  });
}

/**
 * Drives typed rendering on the client: chat-panel.tsx imports this and
 * passes it to `useChat<MigrationCopilotUIMessage>(...)`, so message
 * parts (including each tool's typed input/output) are known at compile
 * time instead of cast with `as unknown as ...`. DurableAgent<TOOLS> is
 * used only as a type here (never instantiated at module scope) — the
 * real agent is constructed inside the workflow function above, per
 * DurableAgent's documented usage pattern.
 */
export type MigrationCopilotUIMessage = InferDurableAgentUIMessage<
  DurableAgent<typeof migrationCopilotTools>
>;
