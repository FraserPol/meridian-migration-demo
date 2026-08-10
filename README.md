# Meridian Capital — Portfolio Watchlist (Vercel SA Take-Home Demo)

A small Next.js app where a customer logs in, creates a profile, and
tracks a stock watchlist — plus a **Migration Copilot**, an AI SDK + AI
Gateway–powered tool aimed at the legacy IT admins deciding whether to
move their own front end and app tier to Vercel.

This is the working demo for `solution-architecture.md` (in the parent
folder). Read that first for the why; this README is the how.

**Live demo:** _add your Vercel deployment URL here after `vercel deploy`_
**Repo:** _add your public GitHub URL here after pushing_

**Deploying this yourself?** Skip ahead to [`SETUP_INSTRUCTIONS.md`](./SETUP_INSTRUCTIONS.md) — explicit, copy-paste commands in order, from "push to GitHub" through to the full Terraform/Vault production setup.

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
  auth.ts               Session cookie signing/verification (jose + bcryptjs)
  vault.ts              OIDC → Vault → dynamic DB credential resolution (+ local fallback)
  db/                   Drizzle ORM schema + lazy connection resolution
  quotes.ts             Deterministic mock quote generator
  legacy-inventory.ts   Mocked legacy route/component inventory
  ai/                   Migration Copilot system prompt, tools, deterministic planner
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

## The Migration Copilot, briefly

Ask it things like:

- "What should we migrate first?"
- "How do we move `/watchlist` to Vercel?"
- "Walk me through migrating `/api/profile` safely."

It always calls `getLegacyRouteInventory` before discussing a route,
`recommendStrategyForRoute` before proposing a strategy, and
`generateMigrationConfig` before showing any code — the strategy logic and
generated `next.config.ts` / `middleware.ts` / `nginx.conf` snippets are
plain deterministic TypeScript (`lib/ai/migration-planner.ts`), not
model-generated text. The model's job is orchestration and explanation,
not writing infrastructure config from scratch — see the comment at the
top of that file for the reasoning.

Model calls route through AI Gateway with provider-level failover ordering
and per-request cost tagging (`app/api/chat/route.ts`) — if the primary
provider serving Claude degrades, the Gateway routes to the next one in
`order` with no code change.

## Known limitations (what I'd flag before anyone relies on this)

- **AI Gateway's cross-model fallback (`models: [...]`) isn't available in
  `@ai-sdk/gateway@1.0.41`**, the version that actually resolved at build
  time — only `order`/`only` for providers serving the *same* model. I
  found this the hard way: `tsc` failed on the `models` field I'd
  initially written based on Vercel's docs, checked the installed
  package's `.d.ts` directly, and rewrote `app/api/chat/route.ts` to use
  `order: ["bedrock", "anthropic"]` (provider failover for Claude
  specifically) instead. Worth re-checking once a newer `@ai-sdk/gateway`
  is published if true cross-model fallback matters for your use case.
- **Terraform was hand-reviewed, not applied or `validate`d** — the build
  environment had no `terraform` binary or cloud credentials. See
  `infra/terraform/README.md` for specifics on what to double-check.
- **The legacy route inventory is static mock data.** In production the
  Migration Copilot's first tool call would hit a real internal endpoint;
  the tool-calling code path is identical either way, but the data itself
  doesn't reflect a real EKS deployment.
- **Secure Compute's VPC peering isn't Terraform-automated** — it's a
  manual acceptance step in the Vercel dashboard today (see
  `infra/terraform/README.md`).
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
