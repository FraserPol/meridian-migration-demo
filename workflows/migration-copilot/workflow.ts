import { DurableAgent, type InferDurableAgentUIMessage } from "@workflow/ai/agent";
import { getWritable } from "workflow";
import { stepCountIs, type ModelMessage, type UIMessageChunk } from "ai";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";
import { migrationCopilotTools } from "@/lib/ai/tools";
import { MIGRATION_COPILOT_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { estimateCostUsd } from "@/lib/ai/pricing";
import {
  classifyQueryComplexity,
  FAST_MODEL,
  FRONTIER_MODEL,
  FRONTIER_FALLBACK_MODEL,
  type ModelTier,
} from "@/lib/ai/routing";
import { getDb } from "@/lib/db";
import { migrationCopilotRuns, type CopilotProviderRecord } from "@/lib/db/schema";

/**
 * Deliberately not a real Gateway model slug. Used only when the live-
 * failover-demo toggle is on (see chat-panel.tsx), to make AI Gateway
 * actually reject the primary model so providerOptions.gateway.models'
 * fallback entry has to serve the request for real — not narrated, not
 * simulated in the prompt. This assumes Gateway's documented behavior
 * ("fallback model list if primary model unavailable") applies to an
 * invalid/nonexistent model slug the same way it applies to a model that's
 * merely down; that's not yet been verified against a live account (see
 * scripts/verify-gateway-fallback.ts) — run that script once AI Gateway
 * billing is set up before relying on this toggle live.
 */
const SIMULATED_UNAVAILABLE_SUFFIX = "-simulated-unavailable";

function modelForTier(tier: ModelTier): string {
  return tier === "fast" ? FAST_MODEL : FRONTIER_MODEL;
}

function fallbackModelsForTier(tier: ModelTier): string[] {
  // Fast tier escalates to the frontier model if it becomes unavailable —
  // don't lose the request, just pay more for it. Frontier tier fails over
  // to a different provider's equivalent model (distinct from
  // order: ["bedrock", "anthropic"] below, which only fails over between
  // providers of the *same* model).
  return tier === "fast" ? [FRONTIER_MODEL] : [FRONTIER_FALLBACK_MODEL];
}

function extractLatestUserText(messages: ModelMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  if (typeof lastUser.content === "string") return lastUser.content;
  return lastUser.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

/**
 * The Migration Copilot, as a durable Vercel Workflow instead of a plain
 * Route Handler Function (see app/api/chat/route.ts's start() call).
 *
 * Why this exists: the whole tool-calling loop (inventory -> strategy ->
 * config) used to run inside a single Function invocation with nothing
 * persisted server-side — a crash or redeploy mid-loop lost everything,
 * and the conversation only ever lived in the browser's useChat state.
 * Each tool's execute function is now a durable step ("use step", see
 * lib/ai/tools.ts) with automatic retries and a result that's persisted
 * and replayed rather than re-executed if this workflow resumes after an
 * interruption. DurableAgent (not the plain ToolLoopAgent used in an
 * earlier iteration of this file) is what makes each of *its* internal
 * model calls durable too — every "use step" it calls runs as a real
 * step because DurableAgent invokes tools directly from this
 * "use workflow" function's own call stack, not from inside another
 * step. A step calling another step collapses into a single non-durable
 * unit (the "use step" directive becomes a no-op) — this is the whole
 * reason DurableAgent exists instead of a thin wrapper around the plain
 * AI SDK agent.
 *
 * `oidcToken` is threaded through from the original request (see
 * app/api/chat/route.ts) because a step function has no way to read the
 * request that triggered it — Headers is a serializable workflow
 * argument type, but here it's simpler to pass just the one token string
 * the persistence step's getDb() call actually needs.
 *
 * `simulateFailover`, when true, forces a real failure of the primary model
 * (see SIMULATED_UNAVAILABLE_SUFFIX above) so AI Gateway's own
 * providerOptions.gateway.models fallback has to serve the response — not
 * narrated, not simulated in the prompt. See the caveat on
 * SIMULATED_UNAVAILABLE_SUFFIX above about verifying this against a live
 * Gateway account before relying on it in front of an interviewer.
 */
export async function migrationCopilotWorkflow(
  messages: ModelMessage[],
  userEmail: string,
  oidcToken: string | null,
  simulateFailover: boolean,
) {
  "use workflow";

  // Cost-aware step-up routing: classify the turn with the fast/cheap model
  // before picking which model the main agent runs on (see lib/ai/routing.ts)
  // — most turns don't need frontier-model reasoning.
  const classification = await classifyQueryComplexity(extractLatestUserText(messages), userEmail);
  const selectedModel = modelForTier(classification.tier);

  const agent = new DurableAgent({
    model: simulateFailover ? `${selectedModel}${SIMULATED_UNAVAILABLE_SUFFIX}` : selectedModel,
    instructions: MIGRATION_COPILOT_SYSTEM_PROMPT,
    tools: migrationCopilotTools,
  });

  const result = await agent.stream({
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
        // Cross-model fallback: if the model above is completely
        // unavailable (not just its primary provider), Gateway retries
        // against this list before failing the request. This is also what
        // makes the live-failover-demo toggle real: when it's on, the
        // model above is deliberately broken, so this list is what
        // actually serves the response.
        models: fallbackModelsForTier(classification.tier),
        // Cost/run attribution: tag every request so Finance can see
        // Migration Copilot spend as its own line item in the AI
        // Gateway observability dashboard, separate from any other AI
        // feature.
        user: userEmail,
        tags: ["migration-copilot", "admin-tool", `tier:${classification.tier}`],
      } satisfies GatewayProviderOptions,
    },
  });

  // Audit trail: who asked, what tools ran (in order), which provider
  // actually served each model call (visible proof of Gateway failover
  // if it happens mid-run), token usage, and an estimated cost. Written
  // by a step, not inline here — DB writes are I/O and belong in a step.
  const toolCalls = result.steps.flatMap((step) =>
    step.toolCalls.map((call) => ({
      name: call.toolName,
      input: call.input,
      output: step.toolResults.find((r) => r.toolCallId === call.toolCallId)?.output,
    })),
  );
  const providers: CopilotProviderRecord[] = [
    {
      provider: "gateway-classifier",
      modelId: FAST_MODEL,
      role: "classifier",
      note: classification.reason,
    },
    ...result.steps.map((step) => ({
      provider: step.model.provider,
      modelId: step.model.modelId,
      role: "agent" as const,
    })),
  ];
  const inputTokens =
    classification.inputTokens +
    result.steps.reduce((sum, step) => sum + (step.usage.inputTokens ?? 0), 0);
  const outputTokens =
    classification.outputTokens +
    result.steps.reduce((sum, step) => sum + (step.usage.outputTokens ?? 0), 0);

  await persistCopilotRun({
    adminEmail: userEmail,
    toolCalls,
    providers,
    inputTokens,
    outputTokens,
    finalResponseText: result.steps.at(-1)?.text ?? "",
    oidcToken,
    simulateFailover,
  });
}

async function persistCopilotRun(record: {
  adminEmail: string;
  toolCalls: Array<{ name: string; input: unknown; output: unknown }>;
  providers: CopilotProviderRecord[];
  inputTokens: number;
  outputTokens: number;
  finalResponseText: string;
  oidcToken: string | null;
  simulateFailover: boolean;
}) {
  "use step";

  // Minimal Pick<Headers, "get"> shim so getDb() can resolve VAULT_ADDR
  // credentials from this step's own invocation — see lib/vault.ts.
  const headers = record.oidcToken
    ? { get: (name: string) => (name === "x-vercel-oidc-token" ? record.oidcToken : null) }
    : undefined;

  const db = await getDb(headers);
  // Rate the whole run off the agent's model, not the classifier's — the
  // classifier is cheap and its tokens are a small fraction of the total,
  // but pricing the entire run at its rate would understate cost whenever
  // the agent escalated to the frontier tier.
  const primaryProvider = record.providers.find((p) => p.role !== "classifier") ?? record.providers[0];
  const estimatedCostUsd = primaryProvider
    ? estimateCostUsd(
        primaryProvider.provider,
        primaryProvider.modelId,
        record.inputTokens,
        record.outputTokens,
      )
    : 0;

  await db.insert(migrationCopilotRuns).values({
    adminEmail: record.adminEmail,
    toolCalls: record.toolCalls,
    providers: record.providers,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    totalTokens: record.inputTokens + record.outputTokens,
    estimatedCostUsd: estimatedCostUsd.toFixed(6),
    finalResponseText: record.finalResponseText,
    simulatedFailureRequested: record.simulateFailover,
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
