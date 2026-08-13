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
    return { tier: "frontier", reason: "Empty or non-text turn — defaulting to frontier.", inputTokens: 0, outputTokens: 0 };
  }

  try {
    const { object, usage } = await generateObject({
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
    return {
      ...object,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    };
  } catch (err) {
    return {
      tier: "frontier",
      reason: `Classifier call failed (${err instanceof Error ? err.message : "unknown error"}) — defaulting to frontier.`,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

export function tierForModelId(modelId: string): ModelTier {
  return modelId === FAST_MODEL ? "fast" : "frontier";
}
