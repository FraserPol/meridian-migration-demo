# Get It Live — Quick Setup

Fastest path to a public URL and public repo. Uses a free Neon Postgres
instead of AWS RDS so there's no infrastructure to provision.

Run every command from inside `meridian-migration-demo/` unless told otherwise.

---

## Step 1: Create a free Postgres database

1. Go to https://neon.tech and sign up (free tier).
2. Create a new project — name it anything, e.g. `meridian-demo`.
3. Copy the connection string. It looks like:
   ```
   postgres://neondb_owner:AbC123@ep-something-123456.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Keep that tab open — you'll paste this in Steps 3 and 5.

## Step 2: Push this repo to GitHub

1. Go to https://github.com/new and create a new **public** repository.
   Don't initialize it with a README.
2. Push:
   ```bash
   git remote add origin https://github.com/<your-github-username>/meridian-migration-demo.git
   git push -u origin main
   ```

## Step 3: Run migrations + seed demo users

```bash
npm install

export DATABASE_URL="paste-your-neon-connection-string-here"
export AUTH_SECRET="$(openssl rand -base64 32)"
echo "Save this AUTH_SECRET for Step 5: $AUTH_SECRET"

npm run db:migrate
npm run db:seed
```

You should see `Seed complete. Demo users: ...` at the end.

## Step 4: Link the project to Vercel

```bash
npm install -g vercel
vercel login
vercel link
```

Answer the prompts: "Set up and deploy?" → No. Pick "Link to existing
project?" → No → give it a name → accept the defaults for Next.js detection.

This creates the project via the CLI, not a GitHub-linked import, so you
don't need to install the [Vercel GitHub App](https://github.com/apps/vercel)
for this quick path — Step 6 deploys straight from your machine. You'd only
need that integration if you later want push-to-deploy instead of running
`vercel deploy --prod` by hand (see `PRODUCTION_SETUP.md`, which does use a
GitHub-linked project via Terraform).

## Step 5: Add environment variables

```bash
vercel env add DATABASE_URL production
```
Paste your Neon connection string from Step 1.

```bash
vercel env add AUTH_SECRET production
```
Paste the `AUTH_SECRET` you saved in Step 3.

## Step 6: Deploy

```bash
vercel deploy --prod
```

This prints your public URL at the end — put it at the top of `README.md`.

## Step 7: Enable AI Gateway (for the Migration Copilot)

Nothing to configure in code — once deployed, AI Gateway authenticates
automatically via the project's OIDC token. Just confirm it's on and
billed:

1. Vercel dashboard → your team → **AI Gateway** tab.
2. If it says "Enable AI Gateway," click it. If you see a dashboard, you're done.
3. **Also add a payment method and top up credits** under your team →
   **AI** — even free-tier usage requires a verified card on file, and some
   models additionally require actual paid credits, not just a verified
   card. Skipping this doesn't break the deploy; it makes the Migration
   Copilot fail silently at chat time instead (see Troubleshooting below).

## Step 8: Try it

Visit your URL from Step 6:

- `jordan.reyes@meridiancapital.demo` / `VercelDemo!2026` — populated watchlist
- `alex.chen@meridiancapital.demo` / `VercelDemo!2026` — onboarding flow
- `admin@meridiancapital.demo` / `VercelDemo!2026` — Migration Copilot

---

## Troubleshooting

- **Login works locally but not on Vercel:** double check `AUTH_SECRET` and
  `DATABASE_URL` are set for the **production** environment (`vercel env ls`),
  not just Preview.
- **Migration Copilot returns an auth error:** AI Gateway isn't enabled for
  your team yet — see Step 7.
- **Migration Copilot's chat stream starts ("thinking…") then fails, or the
  server logs show a 403:** this is a billing issue, not a code or auth
  issue — two separate things Vercel gates on:
  1. `customer_verification_required` — no payment method on file at all.
     Add one: Vercel dashboard → your team → **AI** → **Add credit card**.
  2. `"Free tier users do not have access to this model"` — a card is on
     file, but the team hasn't purchased/topped up actual paid Gateway
     credits yet (separate from just having a verified card). Top up under
     the same **AI** tab; the error message includes a direct link.
  Neither is something `vercel env` or application code can route around.
- **Migration Copilot's chat stream starts, then the deployed Function logs
  `Cannot find module '.../.well-known/workflow/v1/flow/route.js'` or
  `VERCEL_DEPLOYMENT_ID environment variable is not set`:** the project's
  **Settings → Environment Variables → "Automatically expose System
  Environment Variables"** toggle is off. Without it, `VERCEL_ENV`/
  `VERCEL_DEPLOYMENT_ID`/etc. never reach the deployed Function's
  `process.env` — and the Workflow SDK's Vercel-vs-local-dev detection
  depends on `VERCEL_DEPLOYMENT_ID` specifically, so it silently runs the
  Migration Copilot's workflow in local-filesystem mode inside a deployed
  Function (whose filesystem is read-only), crashing every real chat
  message. Turn the toggle on, then redeploy (`vercel deploy --prod`) —
  flipping the setting doesn't restart already-running deployments.
