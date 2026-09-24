import { describe, it, expect } from "vitest";
import { estimateCostUsd } from "./pricing";

/**
 * This table drives both the per-run cost shown in the audit trail and the
 * daily spend cap, so a missed lookup doesn't merely misreport — it
 * silently falls through to the (more expensive) fallback rate and closes
 * the app early. The table previously shipped with keys that never matched
 * a real modelId, and every provider slug the Gateway actually returns has
 * had to be discovered from live traffic, so these are pinned to the slugs
 * observed in this app's own audit rows.
 */
describe("estimateCostUsd", () => {
  it("prices Haiku at the fast-tier rate", () => {
    // 1/M in, 5/M out
    expect(estimateCostUsd("anthropic", "claude-haiku-4.5", 1_000_000, 0)).toBeCloseTo(1);
    expect(estimateCostUsd("anthropic", "claude-haiku-4.5", 0, 1_000_000)).toBeCloseTo(5);
  });

  it("treats the Gateway's `claudeaws` slug as Bedrock, not an unknown provider", () => {
    const viaAlias = estimateCostUsd("claudeaws", "claude-haiku-4.5", 277, 322);
    const viaBedrock = estimateCostUsd("bedrock", "claude-haiku-4.5", 277, 322);
    expect(viaAlias).toBeCloseTo(viaBedrock);
    // Would have been ~0.0057 at the Sonnet fallback rate.
    expect(viaAlias).toBeLessThan(0.003);
  });

  it("prices the frontier tier above the fast tier for identical usage", () => {
    const fast = estimateCostUsd("anthropic", "claude-haiku-4.5", 10_000, 10_000);
    const frontier = estimateCostUsd("anthropic", "claude-sonnet-4.5", 10_000, 10_000);
    expect(frontier).toBeGreaterThan(fast);
  });

  it("falls back rather than throwing on a genuinely unknown model", () => {
    const cost = estimateCostUsd("someprovider", "some-model", 1_000_000, 0);
    expect(cost).toBeCloseTo(3);
  });

  it("returns zero for zero usage", () => {
    expect(estimateCostUsd("anthropic", "claude-haiku-4.5", 0, 0)).toBe(0);
  });
});
