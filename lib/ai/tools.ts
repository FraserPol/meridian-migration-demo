import { tool } from "ai";
import { z } from "zod";
import { getLegacyRouteInventory as readLegacyRouteInventory } from "@/lib/legacy-inventory";
import { recommendMigrationStrategy, generateMigrationSnippet } from "./migration-planner";

/**
 * Each tool's `execute` is a durable workflow step ("use step") — see
 * workflows/migration-copilot/workflow.ts. Marking these as steps means
 * each tool call gets automatic retries and a persisted, replayable
 * result, independent of the model call around it. Defined as top-level
 * named functions (not inline arrow functions) and referenced by name in
 * `tool({ execute })` below — the documented pattern for "use step".
 *
 * All three tools independently re-fetch the legacy inventory rather than
 * one tool passing its `routes` output into the next as an input. That's
 * deliberate, not an oversight: the read is cheap (readLegacyRouteInventory
 * is "use cache"-backed — see lib/legacy-inventory.ts — so tools #2/#3 are
 * cache hits, not real re-fetches), and it keeps each tool's arguments
 * small and robust (a route path string) instead of asking the model to
 * faithfully echo back a whole routes array as a tool-call argument on
 * every subsequent call, which is a real failure mode for structured
 * tool-calling — models drop or mangle large copied JSON more often than
 * they mis-type a short string.
 */

async function fetchLegacyRouteInventory() {
  "use step";
  const routes = await readLegacyRouteInventory();
  return { routes };
}

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
  execute: fetchLegacyRouteInventory,
});

async function recommendStrategy({ route }: { route: string }) {
  "use step";
  const routes = await readLegacyRouteInventory();
  const match = routes.find((r) => r.route === route);
  if (!match) {
    return { error: `No route "${route}" found in the legacy inventory.` };
  }
  return recommendMigrationStrategy(match);
}

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
  execute: recommendStrategy,
});

async function generateConfig({
  route,
  approach,
}: {
  route: string;
  approach: "keep-domain-on-legacy" | "point-domain-to-vercel";
}) {
  "use step";
  const routes = await readLegacyRouteInventory();
  const match = routes.find((r) => r.route === route);
  if (!match) {
    return { error: `No route "${route}" found in the legacy inventory.` };
  }
  return { snippets: generateMigrationSnippet(match, approach) };
}

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
  execute: generateConfig,
});

export const migrationCopilotTools = {
  getLegacyRouteInventory,
  recommendStrategyForRoute,
  generateMigrationConfig,
};
