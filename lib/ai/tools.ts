import { tool } from "ai";
import { z } from "zod";
import { getLegacyRouteInventory as readLegacyRouteInventory } from "@/lib/legacy-inventory";
import { recommendMigrationStrategy, generateMigrationSnippet } from "./migration-planner";

/**
 * Tool #1: reads the "existing AWS-hosted world" — this is the boundary
 * crossing the take-home brief requires ("Connect to at least one system
 * that represents the customer's existing world"). In production this
 * would be a real internal endpoint reached over Secure Compute; here
 * it's the mocked inventory in lib/legacy-inventory.ts. The tool-calling
 * code path is identical either way.
 */
export const getLegacyRouteInventory = tool({
  description:
    "Fetch the current inventory of Meridian's legacy AWS/EKS-hosted routes and " +
    "components: traffic share, complexity, owning team, and current stack. Always " +
    "call this before recommending anything — never guess at what's currently deployed.",
  inputSchema: z.object({}),
  execute: async () => {
    const routes = await readLegacyRouteInventory();
    return { routes };
  },
});

/**
 * Tool #2: deterministic recommendation (see lib/ai/migration-planner.ts
 * for why this is rule-based rather than left to the model).
 */
export const recommendStrategyForRoute = tool({
  description:
    "Given a route from the legacy inventory, recommend an incremental migration " +
    "strategy (vertical/horizontal/hybrid) and approach, using Vercel's documented " +
    "incremental migration patterns. Requires calling getLegacyRouteInventory first.",
  inputSchema: z.object({
    route: z.string().describe("The route path, e.g. /watchlist or /api/profile"),
  }),
  execute: async ({ route }) => {
    const routes = await readLegacyRouteInventory();
    const match = routes.find((r) => r.route === route);
    if (!match) {
      return { error: `No route "${route}" found in the legacy inventory.` };
    }
    return recommendMigrationStrategy(match);
  },
});

/**
 * Tool #3: generates the actual config text for the recommended approach.
 * Also deterministic/template-based — see lib/ai/migration-planner.ts.
 */
export const generateMigrationConfig = tool({
  description:
    "Generate the actual configuration snippets (next.config.ts, proxy.ts, or " +
    "nginx.conf) needed to execute a migration recommendation for a given route and " +
    "approach. Call recommendStrategyForRoute first to get the approach.",
  inputSchema: z.object({
    route: z.string(),
    approach: z.enum(["keep-domain-on-legacy", "point-domain-to-vercel"]),
  }),
  execute: async ({ route, approach }) => {
    const routes = await readLegacyRouteInventory();
    const match = routes.find((r) => r.route === route);
    if (!match) {
      return { error: `No route "${route}" found in the legacy inventory.` };
    }
    return { snippets: generateMigrationSnippet(match, approach) };
  },
});

export const migrationCopilotTools = {
  getLegacyRouteInventory,
  recommendStrategyForRoute,
  generateMigrationConfig,
};
