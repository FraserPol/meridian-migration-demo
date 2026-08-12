/**
 * Rough $/token estimates for cost-per-run display (see
 * workflows/migration-copilot/workflow.ts and chat-panel.tsx). Neither AI
 * SDK nor AI Gateway's stream result returns an actual billed cost — the
 * Gateway dashboard is the source of truth for that. This exists so
 * "cost per run" is something clickable in the room, not just a claim
 * about a dashboard the interviewer can't see; treat it as an estimate,
 * not a bill.
 *
 * Keyed by provider since the same model can be served by different
 * providers (see order: ["bedrock", "anthropic"]) at different prices.
 * Update if Anthropic/AWS Bedrock pricing changes; the fallback rate
 * covers any provider/model combination not listed explicitly.
 */
type PricingKey = `${string}/${string}`;

const FALLBACK_RATE = { inputPerMillion: 3, outputPerMillion: 15 };

const PRICING_USD: Record<PricingKey, { inputPerMillion: number; outputPerMillion: number }> = {
  "anthropic/claude-sonnet-4-5": { inputPerMillion: 3, outputPerMillion: 15 },
  "bedrock/claude-sonnet-4-5": { inputPerMillion: 3, outputPerMillion: 15 },
};

export function estimateCostUsd(
  provider: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = PRICING_USD[`${provider}/${modelId}` as PricingKey] ?? FALLBACK_RATE;
  return (inputTokens / 1_000_000) * rates.inputPerMillion + (outputTokens / 1_000_000) * rates.outputPerMillion;
}
