# Debugging notes

Detailed, chronological write-ups of real bugs hit and fixed during this
build — moved out of `README.md` to keep it a feature description, not a
work-log. The commit history has the actual fix diffs; this is the "why"
and "how it was found" behind a few of them. See `README.md`'s "The
Migration Copilot, briefly" section for the short version of each, and
`PRODUCTION_SETUP.md`'s Troubleshooting section for the actionable
fix/workaround steps for the `VERCEL_DEPLOYMENT_ID` one.

## The audit trail's "which provider served this" column was silently wrong

Verifying the live-failover-demo toggle (see README.md) surfaced a second,
unrelated bug: `StepResult.model` (`step.model.provider`/`.modelId`, what
the audit trail originally read) is captured from the *requested* model
config before the call happens — for any Gateway-routed model it's always
the literal string `"gateway"` and the full requested slug, never what
Gateway's `order`/`models` routing actually served the request with. That
means the audit trail's "which provider served this" column, and every
cost estimate keyed off it, were silently wrong from the moment this
feature was built — not just for the failover toggle, but for ordinary
`order: ["bedrock", "anthropic"]` failover too. The real answer only
exists in `providerMetadata.gateway.routing` (`finalProvider` +
`canonicalSlug`) after the call completes; `servedModel()` in
`lib/ai/routing.ts` reads that instead, and the workflow and the
verification script both use it now.

## The Migration Copilot didn't actually work in production at all, until 2026-08-13

Every real chat message crashed the underlying Workflow run with `Cannot
find module '.../.well-known/workflow/v1/flow/route.js'`, then `Error:
VERCEL_DEPLOYMENT_ID environment variable is not set`, and the workflow
runtime tried (and failed — the path is read-only) to write local
run-state files under `/var/task/.workflow-data` — local-dev filesystem
persistence, running inside a deployed Function.

Root cause: this Vercel project's
`automatically_expose_system_environment_variables` setting was `false`
(confirmed via the Vercel API), so `VERCEL_ENV`/`VERCEL_DEPLOYMENT_ID`/etc.
were never populated into `process.env` at runtime — and `@workflow/next`'s
Vercel-vs-local detection (`node_modules/@workflow/next/dist/index.js`)
keys off exactly `VERCEL_DEPLOYMENT_ID`. Since this project was created by
`infra/terraform/modules/vercel-project` (see `PRODUCTION_SETUP.md`), and
its `vercel_project` resource never set that attribute, the Vercel
provider's default (`false`) applied.

Fixed in two places: flipped to `true` directly via the Vercel API for the
live project, and added
`automatically_expose_system_environment_variables = true` to the
Terraform resource so re-provisioning (or a fresh `terraform apply`
elsewhere) doesn't reintroduce it. Verified end-to-end afterward: a real
login + chat message against the deployed app now completes, and `npx
workflow inspect runs --backend vercel` shows real, completed runs.

Separately, the `migration_copilot_runs` table had also never been
migrated into the real production RDS database (a `relation
"migration_copilot_runs" does not exist` error) — unrelated to the above,
fixed the same day by running `npm run db:migrate` against production per
`PRODUCTION_SETUP.md` Step 7.
