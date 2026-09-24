# Architecture

One paragraph per Vercel/AI SDK primitive used in this app: what it's for, where it lives, and the specific problem it solved here — not a general feature tour.

## Workflows (`WorkflowAgent`)

[`workflows/migration-copilot/workflow.ts`](workflows/migration-copilot/workflow.ts) runs the Migration Copilot as a durable `WorkflowAgent` rather than a plain in-request agent loop. The problem this solves: an admin's chat turn calls tools, waits on human approval, and streams a response, any of which can outlive a single request/response cycle or a serverless function's lifetime. Because the run is durable, a browser refresh, a slow tool, or an approval that isn't answered for a minute don't lose the turn — the client reconnects via [`app/api/chat/[runId]/stream/route.ts`](app/api/chat/%5BrunId%5D/stream/route.ts) and resumes exactly where the stream left off (`run.getReadable({ startIndex })`), and the run ID is persisted client-side in `sessionStorage` (see `RUN_ID_KEY` in [`app/admin/migration-copilot/chat-panel.tsx`](app/admin/migration-copilot/chat-panel.tsx)) so a page reload reconnects rather than starting over.

## Human-in-the-loop tool approval

`generateMigrationConfig` in [`lib/ai/tools.ts`](lib/ai/tools.ts) is marked `needsApproval: true`. The problem this solves: the Copilot can *propose* a migration config, but writing one out is a consequential action in a way that "which route should we migrate first?" is not — the workflow pauses mid-run and waits for an explicit click in [`chat-panel.tsx`](app/admin/migration-copilot/chat-panel.tsx)'s approval-request UI before the tool executes. This is only meaningful because the run is durable in the first place: pausing for a human to come back and click a button is exactly the kind of multi-minute gap a non-durable request handler can't survive.

## AI Gateway

[`lib/ai/routing.ts`](lib/ai/routing.ts) calls models through the Gateway using plain `"provider/model"` strings (`gateway(FAST_MODEL)`), not a provider-specific SDK package. The problem this solves is cost, not just abstraction: a cheap classifier step decides per-turn whether the question needs the frontier model or the fast tier, `providerOptions.gateway.order: ["anthropic", "bedrock"]` fails over between providers serving the *same* model, and a separate `models:` fallback list escalates to a different model entirely if a whole tier goes down — three independent failure/cost modes handled by one config block instead of three retry loops. `tags` on every call (`["migration-copilot", "step-up-classifier"]`, `["portfolio-insight", "customer-facing"]`) is what lets the Gateway dashboard show each feature's spend as its own line item.

## AI Gateway cost accounting (self-maintained)

Neither the AI SDK nor the Gateway's stream result returns a billed dollar figure, so [`lib/ai/pricing.ts`](lib/ai/pricing.ts) estimates it from token counts and a hand-maintained per-provider rate table, keyed by the exact `modelId`/provider strings the Gateway reports. This is the one primitive in this list that isn't a Vercel feature so much as a gap this app fills in front of one — and it's the gap that actually bit: the Gateway reports Claude-served-by-AWS as `claudeaws`, not `bedrock`, so every Bedrock-served run silently fell through to the frontier fallback rate and overstated cost roughly 3x, which fed directly into the spend cap below and closed the app early. [`lib/ai/pricing.test.ts`](lib/ai/pricing.test.ts) now fails closed: it asserts an explicit table entry exists for every provider/model pair the app can actually route through, rather than trusting that a wrong number would look wrong.

## Spend cap gating `/api/chat`

[`lib/ai/budget.ts`](lib/ai/budget.ts) sums estimated cost across both AI-touching tables (`migrationCopilotRuns` and `portfolioInsights`) for the current day, and [`app/api/chat/route.ts`](app/api/chat/route.ts) checks it before a run starts, returning 429 rather than letting a run start and bill anyway. The problem this solves: the audit trail made cost *visible*, but visibility isn't a control — and two independent per-feature budgets can each look healthy while together overrunning, which is why one cap covers both features instead of two.

## BotID

[`instrumentation-client.ts`](instrumentation-client.ts) runs an invisible challenge on `/login`, and [`app/login/actions.ts`](app/login/actions.ts) verifies it server-side (`checkBotId()`) before any credential check runs. The problem this solves: without it, `/login` is a credential-stuffing oracle that a scripted client can hit as fast as the database will answer — verifying the challenge *before* touching the database means a bot's request costs nothing rather than merely returning slower. `BOTID_ENFORCE` gates enforcement so it can be dropped to observe-only for automated testing without removing the code path.

## Cache Components / Partial Prerendering

`cacheComponents: true` in [`next.config.ts`](next.config.ts) is what turns on Next.js's Partial Prerendering, visible as the `◐`/`○`/`ƒ` markers in the build output. The problem this solves: pages like `/dashboard` mix content that's genuinely per-request (a customer's live portfolio quotes) with content that isn't (layout, nav, the static parts of the page shell) — PPR serves the static shell instantly while the dynamic portfolio data streams in, instead of forcing the whole route to be as dynamic as its slowest part.

## `proxy.ts` (routing middleware)

[`proxy.ts`](proxy.ts) is this app's routing middleware — renamed from `middleware.ts` in Next.js 16 — and is what redirects an unauthenticated request away from `/dashboard` or `/admin` before any page code runs. Combined in [`next.config.ts`](next.config.ts) with `withBotId(nextConfig)` wrapped by `withWorkflow(...)` (order matters: `withBotId` needs to see the plain rewrites object `withWorkflow` would otherwise have already transformed into a phase function), this is the layer that BotID's challenge-script rewrites and the workflow runtime both need to sit in front of the app's own routes.

## Postgres via Vercel Marketplace + Drizzle

The database itself is provisioned through the Vercel Marketplace rather than a hand-run instance, with [`lib/db/schema.ts`](lib/db/schema.ts) and the migration files under `drizzle/` as the source of truth for every table (`watchlistItems`, `priceAlerts`, `portfolioInsights`, `migrationCopilotRuns`). Migration `0003`'s `ALTER DEFAULT PRIVILEGES` is the detail worth noting: it makes every *future* table auto-grant to `meridian_app_readwrite`, so adding a table doesn't also require a manual grant step someone can forget.

## HCP Vault OIDC → dynamic Postgres credentials

The app never holds a static database password. [`lib/db/index.ts`](lib/db/index.ts) authenticates to Postgres using short-lived credentials minted per-request via HCP Vault's OIDC integration, scoped to `environment:production`. The problem this solves is credential lifetime, not just secrecy: a leaked static password is a permanent liability until someone notices and rotates it, where a dynamic credential is already expired by the time it could be misused. The trade-off is real and worth stating plainly: because the scope is production-only, every end-to-end test in this project runs against the live production deployment rather than a preview environment — a real constraint of this setup, not an incidental choice, and the thing to fix first if this pattern moved into a real customer engagement (scope credentials to preview as well as production).
