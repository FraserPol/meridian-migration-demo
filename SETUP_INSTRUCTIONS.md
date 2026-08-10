# Setup Instructions

Two parts. **Do Part 1 first** — it's the fastest path to a public URL and
public repo, which is all the take-home actually requires. Part 2 (real
AWS RDS + HCP Vault) is optional, for if you want the full production
architecture actually standing up, e.g. to demo the Terraform live.

Run every command from inside the `meridian-migration-demo/` folder unless told otherwise.

---

## Part 1 — Get it live (public URL + public repo)

### Step 1: Create a free Postgres database

This stands in for "a Postgres reachable from Vercel" so you can get a
public demo up today. Swap it for real AWS RDS later in Part 2 — the app
code doesn't change either way.

1. Go to https://neon.tech and sign up (free tier).
2. Create a new project. Name it anything, e.g. `meridian-demo`.
3. Copy the connection string it gives you. It looks like:
   ```
   postgres://neondb_owner:AbC123@ep-something-123456.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Keep that tab open — you'll paste this in Steps 3 and 5.

### Step 2: Push this repo to GitHub

1. Go to https://github.com/new and create a new **public** repository.
   Don't initialize it with a README (this repo already has one).
2. Copy the commands GitHub shows you under "…or push an existing
   repository from the command line", or just run:
   ```bash
   git remote add origin https://github.com/<your-github-username>/meridian-migration-demo.git
   git push -u origin main
   ```

### Step 3: Run migrations + seed the demo users (one time, from your laptop)

```bash
npm install

export DATABASE_URL="paste-your-neon-connection-string-here"
export AUTH_SECRET="$(openssl rand -base64 32)"
echo "Save this AUTH_SECRET, you need it again in Step 5: $AUTH_SECRET"

npm run db:migrate
npm run db:seed
```

You should see `Seed complete. Demo users: ...` printed at the end.

### Step 4: Connect the project to Vercel

```bash
npm install -g vercel
vercel login
vercel link
```

Answer the prompts: "Set up and deploy?" → No (just linking for now). Pick
"Link to existing project?" → No → give it a name → accept the defaults
for framework detection (Next.js).

### Step 5: Add environment variables in Vercel

```bash
vercel env add DATABASE_URL production
```
Paste your Neon connection string from Step 1 when prompted.

```bash
vercel env add AUTH_SECRET production
```
Paste the `AUTH_SECRET` value you saved in Step 3.

### Step 6: Deploy

```bash
vercel deploy --prod
```

This prints your public URL at the end, something like
`https://meridian-migration-demo.vercel.app`. That's your take-home
submission URL — put it at the top of `README.md`.

### Step 7: Turn on AI Gateway (for the Migration Copilot)

Nothing to configure in code — once deployed on Vercel, AI Gateway
authenticates automatically using the project's own OIDC token. You only
need to confirm AI Gateway is enabled for your team:

1. Go to https://vercel.com/dashboard → your team → **AI Gateway** tab.
2. If it says "Enable AI Gateway," click it. If it already shows a
   dashboard, you're done.

### Step 8: Try it

Visit your URL from Step 6:

- Log in as `jordan.reyes@meridiancapital.demo` / `VercelDemo!2026` — see the populated watchlist.
- Log in as `alex.chen@meridiancapital.demo` / `VercelDemo!2026` — see the "create your profile" onboarding state.
- Log in as `admin@meridiancapital.demo` / `VercelDemo!2026` — try the Migration Copilot. Ask "What should we migrate first?"

**Part 1 done.** You now have a public URL and a public repo with commit history.

---

## Part 2 — Full production setup (real AWS RDS + HCP Vault)

Only do this if you want the actual "what stays outside Vercel"
infrastructure running for real. This takes 20–30 minutes, mostly waiting
on the HCP Vault cluster to provision.

### Step 1: Install Terraform and get credentials ready

```bash
brew install terraform
```

You'll need, all at once:
- An AWS account with an access key
- An HCP account with a service principal (HCP Portal → your org → Service Principals → create one)
- A Vercel API token (https://vercel.com/account/tokens)

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export HCP_CLIENT_ID="..."
export HCP_CLIENT_SECRET="..."
export VERCEL_API_TOKEN="..."
```

### Step 2: Fill in your variables

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Open `terraform.tfvars` and fill in:
- `vercel_team_slug` — find it in your Vercel dashboard URL: `vercel.com/<this-part>`
- `vercel_oidc_issuer` — `https://oidc.vercel.com/<same-team-slug>`
- `github_repo` — `<your-github-username>/meridian-migration-demo`
- `auth_secret` — generate one: `openssl rand -base64 32`

Leave `vault_addr` blank for now.

### Step 3: First apply — network, database, Vault cluster

```bash
terraform init
terraform apply \
  -target=module.aws_network \
  -target=module.aws_database \
  -target=module.aws_oidc_trust \
  -target=module.hcp_vault \
  -target=aws_vpc_peering_connection_accepter.hcp_vault
```

Type `yes` when prompted. This takes 10–15 minutes — the HCP Vault
cluster is the slow part.

### Step 4: Point Terraform at your new Vault cluster

```bash
export VAULT_ADDR="$(terraform output -raw vault_addr)"
export VAULT_TOKEN="$(terraform output -raw vault_bootstrap_admin_token)"
```

Open `terraform.tfvars` again and set:
```
vault_addr = "<paste the same VAULT_ADDR value here>"
```

### Step 5: Second apply — configures Vault, creates the Vercel project

```bash
terraform apply
```

Type `yes` when prompted.

### Step 6: Accept Secure Compute peering (manual, one click)

1. Go to your Vercel project → **Settings** → **Secure Compute**.
2. Accept the pending peering connection from the AWS VPC Terraform just created.

### Step 7: Load real data into the real RDS instance (one time)

Still inside `infra/terraform`:

```bash
export PGUSER_TMP="$(terraform output -raw rds_master_username)"
export PGPASS_TMP="$(terraform output -raw rds_master_password)"
export PGHOST_TMP="$(terraform output -raw rds_endpoint)"
cd ../..
export DATABASE_URL="postgres://${PGUSER_TMP}:${PGPASS_TMP}@${PGHOST_TMP}:5432/meridian?sslmode=require"

npm run db:migrate
npm run db:seed
```

### Step 8: Remove the local-mode env var so the app uses Vault instead

```bash
vercel env rm DATABASE_URL production
```

Confirm `yes`. The `vercel_project` Terraform module already set
`VAULT_ADDR`, `VAULT_JWT_AUTH_ROLE`, `VAULT_DB_ROLE`, `PGHOST`, `PGPORT`,
and `PGDATABASE` for you — with `DATABASE_URL` gone, `lib/vault.ts` now
takes the Vault path automatically. No code change needed.

### Step 9: Redeploy

```bash
vercel deploy --prod
```

**Part 2 done.** The app now resolves short-lived, TTL-bound Postgres
credentials from HCP Vault on every request instead of a static
connection string — the exact pattern described in
`../solution-architecture.md`.

---

## If something breaks

- **Login works locally but not on Vercel:** double check `AUTH_SECRET`
  and `DATABASE_URL` are set for the **production** environment in Vercel
  (`vercel env ls`), not just Preview.
- **Migration Copilot returns an auth error:** AI Gateway isn't enabled
  for your team yet — see Part 1, Step 7.
- **`terraform apply` fails on the vault provider in Step 5:** you likely
  skipped exporting `VAULT_ADDR`/`VAULT_TOKEN` in Step 4, or the cluster
  from Step 3 is still provisioning — check `terraform output vault_addr`
  resolves to something before retrying.
- **Anything else:** see "Known limitations" in `README.md` and
  `infra/terraform/README.md` — a few things (Secure Compute peering,
  RDS master credential rotation) are intentionally manual/out of scope.
