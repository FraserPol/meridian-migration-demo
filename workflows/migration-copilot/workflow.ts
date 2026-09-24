import { WorkflowAgent, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { getWritable } from "workflow";
import {
  isStepCount,
  type InferUITools,
  type ModelMessage,
  type UIDataTypes,
  type UIMessage,
} from "ai";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";
import { migrationCopilotTools } from "@/lib/ai/tools";
import { MIGRATION_COPILOT_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { estimateCostUsd } from "@/lib/ai/pricing";
import {
  classifyQueryComplexity,
  servedModel,
  FAST_MODEL,
  FRONTIER_MODEL,
  FRONTIER_FALLBACK_MODEL,
  type ClassificationResult,
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

// Hard ceiling on generated tokens per model call. The system prompt asks
// for concise, admin-to-admin answers, but a prompt instruction isn't a
// spend guarantee — a misbehaving or adversarial turn (or a model that
// just ignores the instruction) can otherwise generate unboundedly and
// undercut the cost-visibility pitch this feature makes to Finance. This
// caps token spend per step, not per conversation; stopWhen: isStepCount(8)
// below is the per-conversation bound.
const MAX_OUTPUT_TOKENS_PER_STEP = 2000;

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
 * interruption. WorkflowAgent (not the plain ToolLoopAgent used in an
 * earlier iteration of this file) is what makes each of *its* internal
 * model calls durable too — every "use step" it calls runs as a real
 * step because WorkflowAgent invokes tools directly from this
 * "use workflow" function's own call stack, not from inside another
 * step. A step calling another step collapses into a single non-durable
 * unit (the "use step" directive becomes a no-op) — this is the whole
 * reason WorkflowAgent exists instead of a thin wrapper around the plain
 * AI SDK agent. (WorkflowAgent, from @ai-sdk/workflow, is AI SDK 7's
 * replacement for the Workflow SDK's DurableAgent — same durable loop,
 * moved into the AI SDK itself. See
 * https://vercel.com/kb/guide/durableagent-to-workflowagent.)
 *
 * Failure handling: every failure path — classifier error, AI Gateway
 * exhausting its fallback list, a thrown tool/model error — ends the run
 * the same way: an `error` part on the stream (so useChat flips to its
 * error state instead of spinning on "Thinking…" forever), a closed
 * stream, and an audit row with `errorMessage` set (so failed runs show
 * up in the audit trail instead of silently disappearing from it).
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
  //
  // Everything from here to the stream being closed is wrapped: whatever
  // fails, the client must get an `error` part and a closed stream, and the
  // audit trail must get a row. `classification` and `result` are hoisted
  // so the audit row can record however far the run got before failing.
  let classification: ClassificationResult | undefined;
  let result: Awaited<ReturnType<WorkflowAgent<typeof migrationCopilotTools>["stream"]>> | undefined;
  let errorMessage: string | null = null;
  // True once an `error` part is already on the stream — WorkflowAgent
  // writes one itself when the model stream reports an error (e.g. AI
  // Gateway exhausted every fallback), so we must not write a second.
  let errorAlreadyStreamed = false;

  try {
    classification = await classifyQueryComplexity(extractLatestUserText(messages), userEmail);
    const selectedModel = modelForTier(classification.tier);

    const agent = new WorkflowAgent({
      model: simulateFailover ? `${selectedModel}${SIMULATED_UNAVAILABLE_SUFFIX}` : selectedModel,
      instructions: MIGRATION_COPILOT_SYSTEM_PROMPT,
      tools: migrationCopilotTools,
      maxOutputTokens: MAX_OUTPUT_TOKENS_PER_STEP,
    });

    result = await agent.stream({
      messages,
      // WorkflowAgent writes raw ModelCallStreamPart chunks; they're
      // converted to UI chunks at the response boundary instead (see
      // app/api/chat/route.ts's createModelCallToUIChunkTransform()).
      writable: getWritable<ModelCallStreamPart>(),
      // This workflow owns closing the stream (finishCopilotStream below),
      // not the agent — otherwise a thrown error closes the stream with no
      // `error` part, and the client renders an empty "successful" reply
      // instead of its error state.
      sendFinish: false,
      preventClose: true,
      // Cap tool-calling loops: inventory lookup -> strategy -> config is 3
      // steps; allow headroom for follow-up questions in the same turn.
      stopWhen: isStepCount(8),
        providerOptions: {
          gateway: {
            // Provider-level failover for this same model: if the primary
            // serving provider degrades, AI Gateway routes to the next one
            // in this list with no code change and no re-issued API keys —
            // the "provider flexibility and failover" primitive called out
            // in solution-architecture.md Section 4.
            //
            // anthropic first, not bedrock: reproduced directly against a live
            // Gateway account (bypassing the durable agent entirely, via streamText)
            // that the *first* tool call of a streamed multi-step run comes back
            // from Bedrock's Claude endpoint with a corrupted toolName — e.g.
            // `getLegacyRouteInventory" />` instead of `getLegacyRouteInventory`
            // — which then fails tool lookup with "Tool ... not found" and
            // crashes the whole workflow run. Subsequent tool calls in the same
            // run come back clean, and the direct Anthropic API path never
            // corrupts the name at all — this is specific to the Bedrock
            // provider's streaming tool-call-name reconstruction in the
            // installed ai/@ai-sdk/gateway versions, not this app's own tool
            // definitions (verified clean against both providers via
            // generateText; only streamText's first call via bedrock reproduces
            // it). Keeping bedrock as the second entry preserves real failover
            // if Anthropic's direct API degrades, without eating this bug on
            // the common path. Re-promote bedrock once the upstream issue is
            // fixed in a newer ai/@ai-sdk/gateway release.
            order: ["anthropic", "bedrock"],
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

    // Model-stream errors (e.g. every Gateway fallback exhausted) don't
    // throw — WorkflowAgent streams the error part to the client and
    // reports it here instead.
    if ("error" in result) {
      errorMessage = describeError(result.error);
      errorAlreadyStreamed = true;
    }
  } catch (err) {
    errorMessage = describeError(err);
  }

  // Close the client stream before the audit write: the user shouldn't wait
  // on a database round-trip (or its retries) to see the answer or the
  // error.
  await finishCopilotStream(errorAlreadyStreamed ? null : errorMessage);

  const steps = result?.steps ?? [];

  // Audit trail: who asked, what tools ran (in order), which provider
  // actually served each model call (visible proof of Gateway failover
  // if it happens mid-run), token usage, an estimated cost, and — for a
  // failed run — what went wrong. Written by a step, not inline here — DB
  // writes are I/O and belong in a step.
  const toolCalls = steps.flatMap((step) =>
    step.toolCalls.map((call) => ({
      name: call.toolName,
      input: call.input,
      output: step.toolResults.find((r) => r.toolCallId === call.toolCallId)?.output,
    })),
  );
  const providers: CopilotProviderRecord[] = [
    ...(classification
      ? [
          {
            provider: classification.provider,
            modelId: classification.modelId,
            role: "classifier" as const,
            note: classification.reason,
          },
        ]
      : []),
    ...steps.map((step) => ({
      ...servedModel(step),
      role: "agent" as const,
    })),
  ];
  const classifierInputTokens = classification?.inputTokens ?? 0;
  const classifierOutputTokens = classification?.outputTokens ?? 0;
  const inputTokens =
    classifierInputTokens + steps.reduce((sum, step) => sum + (step.usage.inputTokens ?? 0), 0);
  const outputTokens =
    classifierOutputTokens + steps.reduce((sum, step) => sum + (step.usage.outputTokens ?? 0), 0);

  await persistCopilotRun({
    adminEmail: userEmail,
    toolCalls,
    providers,
    inputTokens,
    outputTokens,
    classifierProvider: classification?.provider ?? null,
    classifierModelId: classification?.modelId ?? null,
    classifierInputTokens,
    classifierOutputTokens,
    finalResponseText: steps.at(-1)?.text ?? "",
    oidcToken,
    simulateFailover,
    errorMessage,
  });
}

/**
 * Keeps audit rows and client-facing error text bounded and readable.
 * Errors that cross a step boundary are deserialized into the workflow as
 * plain objects, not Error instances, and JSON.stringify drops an Error's
 * non-enumerable `message` — so read `message` explicitly rather than
 * relying on `instanceof Error` or stringifying the whole value.
 */
function describeError(error: unknown): string {
  let message: string;
  if (typeof error === "string") {
    message = error;
  } else if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    message = error.message;
  } else {
    message = JSON.stringify(error) ?? String(error);
  }
  return (message || "Unknown error").slice(0, 500);
}

/**
 * Ends the client stream. On failure, writes an `error` part first —
 * createModelCallToUIChunkTransform() turns it into a UI `error` chunk,
 * which is what flips useChat's status to "error" in chat-panel.tsx.
 * Stream writes are I/O, so this is a step, not inline workflow code.
 */
async function finishCopilotStream(errorMessage: string | null) {
  "use step";

  const writable = getWritable<ModelCallStreamPart>();
  if (errorMessage !== null) {
    const writer = writable.getWriter();
    try {
      await writer.write({ type: "error", error: errorMessage });
    } finally {
      writer.releaseLock();
    }
  }
  // No explicit `finish` part: createModelCallToUIChunkTransform() emits
  // the UI `finish-step`/`finish` chunks itself when this stream closes.
  await writable.close();
}

async function persistCopilotRun(record: {
  adminEmail: string;
  toolCalls: Array<{ name: string; input: unknown; output: unknown }>;
  providers: CopilotProviderRecord[];
  inputTokens: number;
  outputTokens: number;
  classifierProvider: string | null;
  classifierModelId: string | null;
  classifierInputTokens: number;
  classifierOutputTokens: number;
  finalResponseText: string;
  oidcToken: string | null;
  simulateFailover: boolean;
  errorMessage: string | null;
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
  // The classifier's own slice, priced at its own (cheap) rate — see
  // lib/db/schema.ts's comment on why this is worth breaking out
  // separately: "is step-up routing worth its own cost" needs this to be
  // a real query, not an estimate.
  // Null (not 0) when the classifier never ran — e.g. it was the thing
  // that failed — matching the column's "untracked, not free" semantics.
  const classifierCostUsd =
    record.classifierProvider && record.classifierModelId
      ? estimateCostUsd(
          record.classifierProvider,
          record.classifierModelId,
          record.classifierInputTokens,
          record.classifierOutputTokens,
        )
      : null;

  await db.insert(migrationCopilotRuns).values({
    adminEmail: record.adminEmail,
    toolCalls: record.toolCalls,
    providers: record.providers,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    totalTokens: record.inputTokens + record.outputTokens,
    estimatedCostUsd: estimatedCostUsd.toFixed(6),
    classifierInputTokens: record.classifierInputTokens,
    classifierOutputTokens: record.classifierOutputTokens,
    classifierCostUsd: classifierCostUsd?.toFixed(6) ?? null,
    finalResponseText: record.finalResponseText,
    simulatedFailureRequested: record.simulateFailover,
    errorMessage: record.errorMessage,
  });
}

/**
 * Drives typed rendering on the client: chat-panel.tsx imports this and
 * passes it to `useChat<MigrationCopilotUIMessage>(...)`, so message
 * parts (including each tool's typed input/output) are known at compile
 * time instead of cast with `as unknown as ...`. Built from the tool set
 * directly rather than @ai-sdk/workflow's InferWorkflowAgentUIMessage,
 * which (as of @ai-sdk/workflow 1.x) resolves to a plain UIMessage and
 * would drop the per-tool typing.
 */
export type MigrationCopilotUIMessage = UIMessage<
  unknown,
  UIDataTypes,
  InferUITools<typeof migrationCopilotTools>
>;
