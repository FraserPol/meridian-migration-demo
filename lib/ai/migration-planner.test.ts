import { describe, it, expect } from "vitest";
import type { LegacyRoute } from "@/lib/legacy-inventory";
import { recommendMigrationStrategy, generateMigrationSnippet } from "./migration-planner";

/**
 * Unit tests for the deterministic rules engine behind the Migration
 * Copilot's recommendations (see migration-planner.ts's header comment):
 * the whole "AI orchestrates a lookup, it doesn't write your infra config"
 * argument in solution-architecture.md rests on this file being plain,
 * reviewed TypeScript — these pure functions had zero test coverage before
 * this file existed.
 */

function route(overrides: Partial<LegacyRoute> = {}): LegacyRoute {
  return {
    route: "/watchlist",
    tier: "frontend",
    currentStack: "React (CRA) served from S3 + CloudFront, IT-managed",
    trafficPct: 42,
    complexity: "low",
    owner: "IT Admin Team",
    notes: "",
    ...overrides,
  };
}

describe("recommendMigrationStrategy", () => {
  it("recommends a vertical, keep-domain-on-legacy migration for low-complexity, low-traffic routes", () => {
    const result = recommendMigrationStrategy(
      route({ route: "/status", complexity: "low", trafficPct: 5 }),
    );

    expect(result.strategy).toBe("vertical");
    expect(result.approach).toBe("keep-domain-on-legacy");
    expect(result.rationale).toContain("/status");
    expect(result.rationale).toContain("5%");
  });

  it("escalates to a hybrid, point-domain-to-vercel migration when either complexity or traffic crosses the risk threshold", () => {
    const highComplexity = recommendMigrationStrategy(
      route({ route: "/profile", complexity: "high", trafficPct: 2 }),
    );
    expect(highComplexity.strategy).toBe("hybrid");
    expect(highComplexity.approach).toBe("point-domain-to-vercel");

    // trafficPct >= 15 is the other half of the OR that decides "isRiskier"
    // — exercise it independently of complexity so a regression that
    // drops either clause of that condition still fails this test.
    const highTraffic = recommendMigrationStrategy(
      route({ route: "/reports", complexity: "low", trafficPct: 15 }),
    );
    expect(highTraffic.strategy).toBe("hybrid");
    expect(highTraffic.approach).toBe("point-domain-to-vercel");
  });
});

describe("generateMigrationSnippet", () => {
  it("generates a basePath + nginx proxy_pass pair for keep-domain-on-legacy", () => {
    const snippets = generateMigrationSnippet(
      route({ route: "/watchlist", owner: "IT Admin Team" }),
      "keep-domain-on-legacy",
    );

    expect(snippets).toHaveLength(2);
    const nextConfig = snippets.find((s) => s.filename.startsWith("next.config.ts"));
    const nginx = snippets.find((s) => s.filename.includes("nginx.conf"));

    expect(nextConfig?.code).toContain('basePath: "/watchlist"');
    expect(nginx?.filename).toContain("IT Admin Team");
    expect(nginx?.code).toContain("location /watchlist");
    expect(nginx?.code).toContain("proxy_pass");
  });

  it("generates a fallback rewrite + slugified Global Config kill-switch for point-domain-to-vercel", () => {
    const snippets = generateMigrationSnippet(
      route({ route: "/api/profile" }),
      "point-domain-to-vercel",
    );

    expect(snippets).toHaveLength(2);
    const proxyConfig = snippets.find((s) => s.filename.includes("proxy.ts"));

    // slugify() is a private helper — exercised only through its effect on
    // the generated Global Config key, which must be a valid identifier
    // (no leading/trailing underscores, non-alphanumerics collapsed).
    expect(proxyConfig?.code).toContain('"isNewVersionActive_api_profile"');
    expect(proxyConfig?.code).not.toMatch(/isNewVersionActive_[_/]/);
  });
});
