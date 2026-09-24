import { createHash } from "node:crypto";
import { generateText, gateway } from "ai";
import { FAST_MODEL } from "./routing";
import type { PortfolioSummary } from "@/lib/portfolio";

/**
 * Customer-facing portfolio insight.
 *
 * Deliberately not built on the Workflow/agent machinery the Migration
 * Copilot uses. That exists because the Copilot calls tools across durable
 * step boundaries; this summarises rows the caller has already fetched, so
 * it's one model call with no tools, no step replay and no approval path.
 *
 * There is no free-text input anywhere in this prompt. Everything the
 * model sees is assembled from this app's own database rows, so there is
 * no chat box for a customer to steer the model with — a deliberate
 * limitation, not an oversight.
 */

const INSIGHT_INSTRUCTIONS = `You are a portfolio analyst writing a short briefing for a retail investor at Meridian Capital.

Write 3-4 short paragraphs in markdown covering, in this order:
1. What the portfolio is concentrated in, by share of market value.
2. Whether that concentration fits the investor's stated risk tolerance, and say plainly when it does not.
3. One or two specific, actionable observations.

Rules:
- Only use the figures provided. Never invent prices, returns, holdings or news.
- No greeting, no sign-off, no headings — just the paragraphs.
- Be direct about risk. A concentrated portfolio should be called concentrated.
- This is general information, not personalised financial advice. Do not recommend specific buy or sell actions; describe trade-offs instead.`;

export type InsightInput = {
  riskTolerance: string;
  investmentGoal: string;
  summary: PortfolioSummary;
  /** Tickers tracked without a position, for context on what they watch. */
  watchingOnly: string[];
};

/**
 * Identifies the portfolio an insight was written about. The cache reuses
 * an insight only while this is unchanged, so editing a position or
 * changing risk tolerance invalidates it — prices deliberately are not
 * included, or the cache would miss on every quote tick and the feature
 * would cost a model call per page view.
 */
export function fingerprintPortfolio(input: InsightInput): string {
  const positions = input.summary.positions
    .map((p) => `${p.ticker}:${p.quantity}@${p.costBasis}`)
    .sort()
    .join(",");
  const watching = [...input.watchingOnly].sort().join(",");
  return createHash("sha256")
    .update(`${input.riskTolerance}|${input.investmentGoal}|${positions}|${watching}`)
    .digest("hex")
    .slice(0, 32);
}

function describePortfolio(input: InsightInput): string {
  const { summary } = input;
  if (summary.positions.length === 0) {
    return [
      `Risk tolerance: ${input.riskTolerance}`,
      `Goal: ${input.investmentGoal}`,
      `Positions held: none.`,
      `Tickers watched without a position: ${input.watchingOnly.join(", ") || "none"}`,
    ].join("\n");
  }

  const lines = summary.positions
    .map((p) => {
      const share = summary.totalValue > 0 ? (p.marketValue / summary.totalValue) * 100 : 0;
      return `- ${p.ticker}: ${p.quantity} shares, market value $${p.marketValue.toFixed(2)} (${share.toFixed(1)}% of portfolio), return ${p.gainPct >= 0 ? "+" : ""}${p.gainPct.toFixed(2)}%`;
    })
    .join("\n");

  return [
    `Risk tolerance: ${input.riskTolerance}`,
    `Goal: ${input.investmentGoal}`,
    `Total market value: $${summary.totalValue.toFixed(2)}`,
    `Total return: ${summary.totalGainPct >= 0 ? "+" : ""}${summary.totalGainPct.toFixed(2)}% ($${summary.totalGainUsd.toFixed(2)})`,
    `Positions:`,
    lines,
    `Tickers watched without a position: ${input.watchingOnly.join(", ") || "none"}`,
  ].join("\n");
}

export type GeneratedInsight = {
  insight: string;
  provider: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Runs on FAST_MODEL rather than the frontier tier: this is a summary of
 * supplied figures, not multi-step reasoning, and it is the one AI call in
 * the app that every customer can trigger — the tier that scales is the
 * one that has to be cheap.
 */
export async function generateInsight(
  input: InsightInput,
  userEmail: string,
): Promise<GeneratedInsight> {
  const { text, usage, providerMetadata } = await generateText({
    model: gateway(FAST_MODEL),
    system: INSIGHT_INSTRUCTIONS,
    prompt: describePortfolio(input),
    maxOutputTokens: 600,
    providerOptions: {
      gateway: {
        user: userEmail,
        // Its own tag so customer-facing spend is a separate line item
        // from the admin Copilot in the AI Gateway dashboard — they scale
        // with entirely different things.
        tags: ["portfolio-insight", "customer-facing"],
      },
    },
  });

  const routing = (providerMetadata as { gateway?: { routing?: Record<string, string> } })?.gateway
    ?.routing;

  return {
    insight: text.trim(),
    provider: routing?.finalProvider ?? "anthropic",
    modelId: (routing?.canonicalSlug ?? FAST_MODEL).split("/").pop() ?? FAST_MODEL,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  };
}
