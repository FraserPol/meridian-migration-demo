import { ToolLoopAgent, stepCountIs, type InferAgentUIMessage } from "ai";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";
import { migrationCopilotTools } from "./tools";
import { MIGRATION_COPILOT_SYSTEM_PROMPT } from "./prompts";
import { z } from "zod";

/**
 * The Migration Copilot, defined once as a `ToolLoopAgent` (AI SDK 6+) and
 * reused by both the streaming API route and (potentially) any future
 * background/CLI entry point — the exact "define once, use everywhere"
 * pattern the current AI SDK docs recommend over inlining `streamText` +
 * tools + stopWhen directly in the route handler.
 *
 * Per-request values (which admin is asking, for AI Gateway spend
 * attribution) can't live in this module-level definition, so they're
 * threaded through via `callOptionsSchema` + `prepareCall` below and
 * supplied per-call from app/api/chat/route.ts.
 */
export const migrationCopilotAgent = new ToolLoopAgent({
  // AI SDK auto-detects the AI Gateway from the "creator/model" string.
  // On Vercel this authenticates via the project's OIDC token
  // automatically (see solution-architecture.md); locally it falls back
  // to AI_GATEWAY_API_KEY from .env.local.
  model: "anthropic/claude-sonnet-4.5",
  instructions: MIGRATION_COPILOT_SYSTEM_PROMPT,
  tools: migrationCopilotTools,
  // Cap tool-calling loops: inventory lookup -> strategy -> config is
  // 3 steps; allow headroom for follow-up questions in the same turn.
  stopWhen: stepCountIs(8),
  // Call-time options: the one piece of per-request data this agent
  // needs (who's asking, for Gateway attribution) without redefining the
  // whole agent per-request.
  callOptionsSchema: z.object({
    userEmail: z.string(),
  }),
  prepareCall: ({ options, ...settings }) => ({
    ...settings,
    providerOptions: {
      gateway: {
        // Provider-level failover for this same model: if the primary
        // serving provider degrades, AI Gateway routes to the next one
        // in this list with no code change and no re-issued API keys —
        // the "provider flexibility and failover" primitive called out
        // in solution-architecture.md Section 4.
        order: ["bedrock", "anthropic"],
        // Cost/run attribution: tag every request so Finance can see
        // Migration Copilot spend as its own line item in the AI
        // Gateway observability dashboard, separate from any other AI
        // feature.
        user: options.userEmail,
        tags: ["migration-copilot", "admin-tool"],
      } satisfies GatewayProviderOptions,
    },
  }),
});

/**
 * Drives typed rendering on the client: chat-panel.tsx imports this and
 * passes it to `useChat<MigrationCopilotUIMessage>(...)`, so message
 * parts (including each tool's typed input/output) are known at compile
 * time instead of cast with `as unknown as ...`.
 */
export type MigrationCopilotUIMessage = InferAgentUIMessage<typeof migrationCopilotAgent>;
