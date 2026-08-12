# Meridian Capital — Portfolio Watchlist (Vercel SA Take-Home Demo)

A small Next.js app where a customer logs in, creates a profile, and
tracks a stock watchlist — plus a **Migration Copilot**, an AI SDK + AI
Gateway–powered tool aimed at the legacy IT admins deciding whether to
move their own front end and app tier to Vercel.

This is the working demo for the take-home submission at
[**FraserPol/vercel-tech-excersise**](https://github.com/FraserPol/vercel-tech-excersise),
specifically its [`solution-architecture.md`](https://github.com/FraserPol/vercel-tech-excersise/blob/main/solution-architecture.md).
Read that first for the why; this README is the how.

**Live demo:** _add your Vercel deployment URL here once you're ready to publish it_
**Repo:** https://github.com/FraserPol/meridian-migration-demo (this repo)

**Deploying this yourself?** Skip ahead to [`PRODUCTION_SETUP.md`](./PRODUCTION_SETUP.md) — explicit, copy-paste commands in order, from Terraform init through the full AWS RDS + HCP Vault production setup.

## Demo accounts

Password for all three: **`VercelDemo!2026`**

| Email | Role | What it shows |
|---|---|---|
| `jordan.reyes@meridiancapital.demo` | customer | Already onboarded, populated watchlist (AAPL, MSFT, TSLA) |
| `alex.chen@meridiancapital.demo` | customer | Account exists, no profile yet — the onboarding/"create a profile" flow |
| `admin@meridiancapital.demo` | admin | Redirects straight to the Migration Copilot |

These are created by `npm run db:seed` (see below) — not present until you run it.

## What's here

```
app/                    Next.js App Router
  login/                Credentials-based login (jose-signed session cookie)
  dashboard/             Customer-facing: profile + watchlist
  admin/migration-copilot/  Admin-only: the AI SDK + AI Gateway chat tool
  api/quotes/            Mocked "existing AWS-hosted market-data API"
  api/legacy-inventory/  Mocked "existing AWS/EKS route inventory" (admin-only, curl-able)
  api/chat/              Streaming AI SDK route backing the Migration Copilot
lib/
  session.ts            Session cookie signing/verification (jose)
  password.ts           Password hashing (bcryptjs) — split from session.ts, see its comment
  vault.ts              OIDC → Vault → dynamic DB credential resolution (+ local fallback)
  db/                   Drizzle ORM schema + lazy connection resolution
  quotes.ts             Deterministic mock quote generator
  legacy-inventory.ts   Mocked legacy route/component inventory, cached with "use cache"
  ai/                   Migration Copilot: system prompt, tools (durable steps), deterministic planner
workflows/
  migration-copilot/    The Migration Copilot as a durable Vercel Workflow (DurableAgent)
proxy.ts                 Auth gating for /dashboard, /admin — Next.js 16's middleware.ts rename
infra/terraform/         AWS + HCP Vault + Vercel infrastructure (see its own README)
.github/workflows/ci.yml GitHub Actions: lint, typecheck, migration dry-run, build
```

## Running it locally

```bash
npm install
cp .env.example .env.local   # fill in AUTH_SECRET at minimum
docker compose up -d          # local Postgres, standing in for AWS RDS
npm run db:generate           # generate SQL from lib/db/schema.ts (already committed under drizzle/)
npm run db:migrate            # apply it
npm run db:seed               # create the three demo accounts above
npm run dev
```

Open http://localhost:3000 and sign in with any of the demo accounts.

**AI Gateway locally:** the Migration Copilot needs either an
`AI_GATEWAY_API_KEY` in `.env.local`, or a Vercel OIDC token pulled via
`vercel env pull` (see `.env.example` for both options). Without either,
`/api/chat` will return an auth error from AI Gateway — the rest of the
app works fine without it.

## Deploying to Vercel

```bash
vercel link
vercel env add AUTH_SECRET production
# DATABASE_URL should NOT be set in production — see "Two ways to run this" below
vercel deploy --prod
```

Once deployed, AI Gateway authenticates automatically via the project's
Vercel OIDC token — no `AI_GATEWAY_API_KEY` needed in production, though
your Vercel team still needs a payment method on file before AI Gateway
will serve requests at all, even free-tier ones — see Known Limitations.

For the full production path (real AWS RDS + HCP Vault instead of the
`DATABASE_URL` fallback), see [`PRODUCTION_SETUP.md`](./PRODUCTION_SETUP.md).

## Two ways to run this app, on purpose

`lib/vault.ts` supports two paths, and which one is active is controlled
entirely by which environment variables are set:

1. **`DATABASE_URL` is set** (local dev, and this is what `docker-compose`
   + `.env.example` give you out of the box) → the app connects straight
   to Postgres with a static connection string. This is the fallback
   explicitly called out in `solution-architecture.md` Section 3.
2. **`VAULT_ADDR` is set instead** (what `infra/terraform` provisions) →
   every request/build resolves a fresh, TTL-bound Postgres credential
   from HCP Vault's database secrets engine, authenticated via the
   Vercel-issued OIDC token — no static secret anywhere. This is the
   production path the architecture doc describes.

Both paths run the exact same application code above `lib/vault.ts` — the
point of the abstraction is that nothing in `lib/db/index.ts` or any page
needs to know which one is active.

`lib/session.ts`'s session-signing secret follows the identical pattern,
one level up: `AUTH_SECRET` set directly (local dev, or `SETUP_INSTRUCTIONS.md`'s
quick path) vs. resolved from Vault's KV-v2 static-secrets mount when only
`VAULT_ADDR` is set (`lib/vault.ts`'s `getAuthSecret()`) — the "application
secrets and configuration secrets" half of the Vault requirement, as
distinct from the dynamic DB credentials above. Every request/build that
needs it (session creation, verification, and `proxy.ts`'s auth gate) has
to thread the incoming request's headers through to `getAuthSecret()`,
since that's how a Vercel Function receives its OIDC token at runtime
(`x-vercel-oidc-token`, not the `VERCEL_OIDC_TOKEN` env var — that's
build-time only).

## The Migration Copilot, briefly

Ask it things like:

- "What should we migrate first?"
- "How do we move `/watchlist` to Vercel?"
- "Walk me through migrating `/api/profile` safely."

It always calls `getLegacyRouteInventory` before discussing a route,
`recommendStrategyForRoute` before proposing a strategy, and
`generateMigrationConfig` before showing any code — the strategy logic and
generated `next.config.ts` / `proxy.ts` / `nginx.conf` snippets are
plain deterministic TypeScript (`lib/ai/migration-planner.ts`), not
model-generated text. The model's job is orchestration and explanation,
not writing infrastructure config from scratch — see the comment at the
top of that file for the reasoning.

The agent itself is defined once, as a `DurableAgent`
(`workflows/migration-copilot/workflow.ts`) rather than inlined into the
route handler — the model, instructions, tools, and stop condition live
in one place. `app/api/chat/route.ts` just `start()`s the workflow and
pipes its stream back to the client. Model calls route through AI Gateway
with provider-level failover ordering and per-request cost tagging (set
directly in the workflow's `providerOptions.gateway`) — if the primary
provider serving Claude degrades, the Gateway routes to the next one in
`order` with no code change.

**Why a Workflow, not a plain Route Handler:** the whole tool-calling loop
(inventory → strategy → config) used to run inside one Function
invocation with nothing persisted server-side — a crash or redeploy
mid-loop lost everything. Each tool's `execute` (`lib/ai/tools.ts`) is now
a durable Vercel Workflow step (`"use step"`), with automatic retries and
a result that's persisted and replayed rather than re-executed if the run
is interrupted. `DurableAgent` (from `@workflow/ai`, not the plain
`ToolLoopAgent`) is what makes this actually work — every tool call it
makes happens directly from the `"use workflow"` function's own call
stack, not from inside another step, which matters because a step calling
another step collapses into one non-durable unit (`"use step"` becomes a
no-op when it's not called directly from a workflow function).

## Known limitations (what I'd flag before anyone relies on this)

- **AI Gateway requires a payment method on file for the Vercel team**,
  even to use free-tier credits — without one, the Migration Copilot's
  chat stream starts (the UI shows "thinking") and then silently fails
  with a 403 (`customer_verification_required`) that isn't surfaced in the
  chat UI. Add a card under Vercel dashboard → your team → **AI** →
  **Add credit card**. Not something Terraform or application code can
  route around.
- **Cache Components (`next.config.ts`'s `cacheComponents: true`) is
  enabled but only fully adopted on one code path.** Every authenticated
  page reads the session cookie and does a live, per-user DB read — there
  is no static shell to serve a signed-out visitor, so those segments
  opt out of instant-navigation validation with `export const instant =
  false` (the officially documented incremental-adoption pattern) rather
  than being forced into a Suspense-per-layout rewrite of a working auth
  flow. The one genuinely cacheable read — the legacy route inventory the
  Migration Copilot advises on (`lib/legacy-inventory.ts`) — uses `"use
  cache"` + `cacheLife("max")` for real, since in production that's a
  CMDB export that changes on a change-management cadence, not per
  request. `/login` needed no changes: it was already a static shell.
- **`ai` is pinned to `6.0.252`, not the `7.x` this project ran earlier.**
  An earlier iteration upgraded to `ai@7` specifically for `ToolLoopAgent`
  + `createAgentUIStreamResponse`. Adopting Vercel Workflow's `DurableAgent`
  for real durability (see above) forced a downgrade back to `ai@6` —
  `@workflow/ai`'s published versions all peer-depend on `ai@^6`
  (verified against every version on npm, including the higher-numbered
  ones, which are marked deprecated: "published in error... this is a 4.x
  patch mislabeled as a major"). Confirmed `ToolLoopAgent` and
  `createAgentUIStreamResponse` both still exist in `ai@6` before
  downgrading (checked the installed `.d.ts` directly), though neither is
  used anymore now that `DurableAgent` replaces `ToolLoopAgent` entirely.
  `@ai-sdk/react`/`@ai-sdk/gateway` stayed at their existing `4.x` — neither
  declares `ai` as a peer dependency, and both worked unchanged. AI
  Gateway's cross-model fallback (`models: [...]`) and same-model
  provider failover (`order: [...]`) are both still available at this
  version; `order: ["bedrock", "anthropic"]` is what's used, since that's
  the actual scenario being modeled.
- **Terraform has since been applied for real** against live AWS/HCP/Vercel
  accounts (not just `validate`/`plan`), which surfaced several bugs hand
  review alone missed — an output comparing a possibly-`null` value against
  `""`, an OIDC audience/environment claim mismatch that would have made
  Vault/AWS auth silently fail for every real deployment, and HCP Vault
  Dedicated's requirement that every request carry an `X-Vault-Namespace:
  admin` header (root is reserved for HashiCorp's platform operations).
  All fixed; see `infra/terraform/README.md` and `PRODUCTION_SETUP.md`'s
  Troubleshooting section for the specifics of each.
- **Vercel Secure Compute is Enterprise-only.** The architecture in
  `solution-architecture.md` calls for it to give the deployed app private
  network access to Vault/RDS; on Hobby/Pro it's unavailable (`Contact
  Sales`). `PRODUCTION_SETUP.md`'s Step 6 documents the demo-only
  workaround (public endpoints + TLS/credential auth instead of network
  isolation) and the actual production recommendation.
- **The legacy route inventory is static mock data.** In production the
  Migration Copilot's first tool call would hit a real internal endpoint;
  the tool-calling code path is identical either way, but the data itself
  doesn't reflect a real EKS deployment.
- **All three demo accounts share one password.** Fine for a public
  take-home repo with no real data behind it; would never fly for an
  actual Meridian deployment.
- **This demo doesn't implement Rolling Releases or a canary rollout** —
  that's a project-level Vercel setting, not application code, and is
  covered in `solution-architecture.md`'s rollout plan instead.

## Development tooling

Built with Claude (Sonnet) in an agentic coding session, working file-by-file
with the actual repo rather than generating it blind — schema, auth,
Vault client, AI tools, and Terraform were each reviewed and adjusted
individually, and the full production Terraform path was later applied
against live AWS/HCP/Vercel accounts and debugged end to end (see Known
Limitations and `infra/terraform/README.md`) rather than left as
untested hand-review. AI behavior in the Migration Copilot was validated
by: manual review of the three-tool call sequence against the system
prompt's rules, confirming the recommendation/config-generation logic is
deterministic TypeScript rather than model output (see
`lib/ai/migration-planner.ts`), and exercising the chat UI's suggested
prompts against the mocked inventory to confirm consistent tool-call
ordering.
