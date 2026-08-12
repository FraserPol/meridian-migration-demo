import { describe, it, expect } from "vitest";
import { generateText, stepCountIs } from "ai";
import { migrationCopilotTools } from "./tools";
import { MIGRATION_COPILOT_SYSTEM_PROMPT } from "./prompts";

/**
 * Regression eval for the Migration Copilot's tool-call ordering — the
 * rule the system prompt states (inventory before strategy, strategy
 * before config, never hand-written) but that, before this file existed,
 * was only ever checked by manual review of one conversation. This tests
 * the actual model's behavior against fixed prompts, not just the code
 * that wires tools together — a real eval, not a unit test.
 *
 * Calls the real model via AI Gateway. `migrationCopilotTools`' "use
 * step" directives are a documented no-op when called outside a workflow
 * (see workflows/migration-copilot/workflow.ts's own comment on this) —
 * that's why this can call generateText directly with the same
 * tools/prompt the real DurableAgent uses, without needing the Workflow
 * runtime or a deployed app.
 *
 * Skipped, not failed, when no Gateway credentials are available (e.g. a
 * fork's CI without the secret configured) — see AI_GATEWAY_API_KEY in
 * .github/workflows/ci.yml. A skipped eval is a visible gap; a broken CI
 * pipeline for anyone without billing configured is worse.
 */
const hasGatewayCredentials = Boolean(
  process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN,
);

const FIXED_PROMPTS = [
  "What should we migrate first?",
  "How do we move /watchlist to Vercel?",
  "Walk me through migrating /api/profile safely.",
  "What's the rollback plan for /admin/reports?",
  "Generate the config for moving /watchlist to Vercel.",
];

describe.skipIf(!hasGatewayCredentials)("Migration Copilot tool-call order eval", () => {
  for (const prompt of FIXED_PROMPTS) {
    it(
      `never calls strategy/config before inventory for: "${prompt}"`,
      async () => {
        const result = await generateText({
          model: "anthropic/claude-sonnet-4.5",
          system: MIGRATION_COPILOT_SYSTEM_PROMPT,
          tools: migrationCopilotTools,
          stopWhen: stepCountIs(8),
          prompt,
        });

        const toolCallOrder = result.steps.flatMap((step) =>
          step.toolCalls.map((call) => call.toolName),
        );

        const inventoryIdx = toolCallOrder.indexOf("getLegacyRouteInventory");
        const strategyIdx = toolCallOrder.indexOf("recommendStrategyForRoute");
        const configIdx = toolCallOrder.indexOf("generateMigrationConfig");

        // The system prompt requires calling the inventory before
        // discussing any specific route — every one of these prompts
        // names a route, so it must always be called.
        expect(inventoryIdx).toBeGreaterThanOrEqual(0);

        if (strategyIdx >= 0) {
          expect(strategyIdx).toBeGreaterThan(inventoryIdx);
        }
        if (configIdx >= 0) {
          expect(configIdx).toBeGreaterThan(strategyIdx >= 0 ? strategyIdx : inventoryIdx);
        }
      },
      30_000, // real model calls need more than vitest's 5s default
    );
  }
});
