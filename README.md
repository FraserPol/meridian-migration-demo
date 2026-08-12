# Meridian Capital — Portfolio Watchlist (Vercel SA Take-Home Demo)

A small Next.js app where a customer logs in, creates a profile, and
tracks a stock watchlist — plus a **Migration Copilot**, an AI SDK + AI
Gateway–powered tool aimed at the legacy IT admins deciding whether to
move their own front end and app tier to Vercel.

This is the working demo for `solution-architecture.md` (in the parent
folder). Read that first for the why; this README is the how.

**Live demo:** _add your Vercel deployment URL here after `vercel deploy`_
**Repo:** _add your public GitHub URL here after pushing_

**Deploying this yourself?** Skip ahead to [`PRODUCTION_SETUP.md`](https://github.com/FraserPol/meridian-migration-demo/blob/main/PRODUCTION_SETUP.md) — explicit, copy-paste commands in order, from Terraform init through the full AWS RDS + HCP Vault production setup.

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
  ai/                   Migration Copilot: agent.ts (ToolLoopAgent), system prompt, tools,
                         deterministic planner
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
Vercel OIDC token — no `AI_GATEWAY_API_KEY` needed in production.

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

The agent itself is defined once as a `ToolLoopAgent` (`lib/ai/agent.ts`,
AI SDK 6+) rather than inlined into the route handler — the model,
instructions, tools, and stop condition live in one place, and
`app/api/chat/route.ts` just calls `createAgentUIStreamResponse`. Model
calls route through AI Gateway with provider-level failover ordering and
per-request cost tagging (set in `lib/ai/agent.ts`'s `prepareCall`) — if
the primary provider serving Claude degrades, the Gateway routes to the
next one in `order` with no code change.

## Known limitations (what I'd flag before anyone relies on this)

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
- **`ai`/`@ai-sdk/*` were upgraded to the current majors** (`ai@7`,
  `@ai-sdk/react@4`, `@ai-sdk/gateway@4`) specifically to adopt
  `ToolLoopAgent` + `createAgentUIStreamResponse` (`lib/ai/agent.ts`),
  which the take-home brief names directly. This also resolved an earlier
  limitation noted here: AI Gateway's cross-model fallback (`models:
  [...]`) wasn't in the `@ai-sdk/gateway@1.0.41` this project originally
  pinned — it's present in `@ai-sdk/gateway@4.0.47`, confirmed by
  checking the installed package's `.d.ts` directly rather than trusting
  docs prose. `order: ["bedrock", "anthropic"]` (same-model provider
  failover) is still what's used, since that's the actual scenario being
  modeled — `models` is there if cross-model fallback is ever needed.
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
individually. AI behavior in the Migration Copilot was validated by:
manual review of the three-tool call sequence against the system prompt's
rules, confirming the recommendation/config-generation logic is
deterministic TypeScript rather than model output (see
`lib/ai/migration-planner.ts`), and exercising the chat UI's suggested
prompts against the mocked inventory to confirm consistent tool-call
ordering.
