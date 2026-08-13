import { generateObject, gateway } from "ai";
import { z } from "zod";

/**
 * Cost-aware step-up routing for the Migration Copilot (see
 * workflows/migration-copilot/workflow.ts): most turns ("what routes do we
 * have?", "what's the traffic on /watchlist?") are answered correctly by a
 * fast/cheap model. Only turns that ask for a migration recommendation or
 * generated config need the frontier model's multi-step infra reasoning.
 * Model slugs per Vercel's current AI Gateway model list.
 */
export const FAST_MODEL = "anthropic/claude-haiku-4.5";
export const FRONTIER_MODEL = "anthropic/claude-sonnet-4.5";
// Cross-provider fallback for the frontier tier — a different provider
// entirely, not just a different serving provider of the same model (that's
// already covered by providerOptions.gateway.order in workflow.ts).
export const FRONTIER_FALLBACK_MODEL = "openai/gpt-5.4";

export type ModelTier = "fast" | "frontier";

export interface ClassificationResult {
  tier: ModelTier;
  reason: string;
  inputTokens: number;
  outputTokens: number;
  provider: string;
  modelId: string;
}

export interface ServedModelInfo {
  provider: string;
  modelId: string;
}

function bareModelId(slug: string): string {
  const slashIdx = slug.indexOf("/");
  return slashIdx >= 0 ? slug.slice(slashIdx + 1) : slug;
}

interface GatewayRoutingMetadata {
  finalProvider?: string;
  canonicalSlug?: string;
}

function gatewayRouting(providerMetadata: unknown): GatewayRoutingMetadata | undefined {
  const gatewayMeta = (providerMetadata as { gateway?: { routing?: GatewayRoutingMetadata } } | undefined)
    ?.gateway;
  return gatewayMeta?.routing;
}

/**
 * The AI SDK's own `model.provider`/`model.modelId` fields (on both
 * `StepResult` and other result types) are captured from the *requested*
 * model config before the call happens — for a Gateway-routed model that's
 * always the literal string "gateway" and the full requested slug, never
 * what Gateway's internal order/models fallback actually served the
 * request with. Confirmed empirically (see
 * scripts/verify-gateway-fallback.ts): during a real fallback, `model.*`
 * still names the *broken* primary, while `providerMetadata.gateway.routing`
 * (only populated after the call completes) has the truth —
 * `finalProvider` (the provider/infra that actually served it) and
 * `canonicalSlug` (which model, as "provider/model"). This is what the
 * audit trail (workflows/migration-copilot/workflow.ts) reads, falling
 * back to the static `model` fields only if that metadata is ever missing.
 */
export function servedModel(step: {
  model: { provider: string; modelId: string };
  providerMetadata?: unknown;
}): ServedModelInfo {
  const routing = gatewayRouting(step.providerMetadata);
  if (routing?.finalProvider && routing?.canonicalSlug) {
    return { provider: routing.finalProvider, modelId: bareModelId(routing.canonicalSlug) };
  }
  return { provider: step.model.provider, modelId: bareModelId(step.model.modelId) };
}

const CLASSIFIER_INSTRUCTIONS =
  'You route questions for a legacy-to-Vercel migration copilot. Reply "frontier" ' +
  "if the question asks for a migration recommendation, a rollback/incremental-" +
  "migration plan, or generated config for a specific route — anything needing " +
  'multi-step infra reasoning. Reply "fast" for everything else (listing routes, ' +
  'definitions, status questions, small talk). When unsure, reply "frontier" — a ' +
  "correct answer from a stronger model beats a wrong answer from picking the " +
  "cheap tier.";

/**
 * A durable step: classifies the latest user turn with the fast/cheap model
 * before the main agent's model is even chosen, so classification costs a
 * fraction of a cent instead of paying frontier-model rates just to find out
 * a question was simple. Fails safe to "frontier" on any classifier error —
 * see workflows/migration-copilot/workflow.ts for how the result feeds into
 * providerOptions.gateway.models (the escalation path if the fast tier
 * itself becomes unavailable).
 */
export async function classifyQueryComplexity(
  latestUserText: string,
  userEmail: string,
): Promise<ClassificationResult> {
  "use step";

  if (!latestUserText.trim()) {
    return {
      tier: "frontier",
      reason: "Empty or non-text turn — defaulting to frontier.",
      inputTokens: 0,
      outputTokens: 0,
      provider: "anthropic",
      modelId: bareModelId(FRONTIER_MODEL),
    };
  }

  try {
    const { object, usage, providerMetadata } = await generateObject({
      model: gateway(FAST_MODEL),
      schema: z.object({
        tier: z.enum(["fast", "frontier"]),
        reason: z.string().describe("One short sentence explaining the tier choice."),
      }),
      system: CLASSIFIER_INSTRUCTIONS,
      prompt: latestUserText,
      providerOptions: {
        gateway: {
          user: userEmail,
          // Separate tag from the main agent call so the AI Gateway
          // dashboard can show classifier spend as its own line item —
          // it should be near-zero relative to agent spend if step-up
          // routing is doing its job.
          tags: ["migration-copilot", "step-up-classifier"],
        },
      },
    });
    const routing = gatewayRouting(providerMetadata);
    const served =
      routing?.finalProvider && routing?.canonicalSlug
        ? { provider: routing.finalProvider, modelId: bareModelId(routing.canonicalSlug) }
        : { provider: "anthropic", modelId: bareModelId(FAST_MODEL) };
    return {
      ...object,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      ...served,
    };
  } catch (err) {
    return {
      tier: "frontier",
      reason: `Classifier call failed (${err instanceof Error ? err.message : "unknown error"}) — defaulting to frontier.`,
      inputTokens: 0,
      outputTokens: 0,
      provider: "anthropic",
      modelId: bareModelId(FAST_MODEL),
    };
  }
}

export function tierForModelId(modelId: string): ModelTier {
  return modelId === bareModelId(FAST_MODEL) ? "fast" : "frontier";
}
