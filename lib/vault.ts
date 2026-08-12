/**
 * Vault-backed dynamic database credentials.
 *
 * This implements the boundary-crossing pattern described in
 * solution-architecture.md Section 3 ("How the boundary crossing actually
 * works"):
 *
 *   1. A Vercel Function never holds a static AWS key or a static Vault
 *      token. On invocation, Vercel issues a short-lived, signed OIDC
 *      token (env var VERCEL_OIDC_TOKEN).
 *   2. HCP Vault trusts Vercel as an OIDC issuer via Vault's `jwt` auth
 *      method (see infra/terraform/modules/vault-config). The function
 *      exchanges its Vercel OIDC token for a short-lived Vault token.
 *   3. That Vault token reads a dynamic, TTL-bound Postgres credential
 *      from Vault's database secrets engine — never a standing password.
 *
 * DEMO SCOPE / DELIBERATE DECISION:
 * Standing up a live HCP Vault cluster is out of scope for a "small,
 * deployed slice" demo (the take-home brief is explicit that size of
 * build is not what's being evaluated). So this module implements the
 * real production code path in full, but falls back to a static
 * DATABASE_URL when Vault isn't configured — which is exactly the
 * situation for anyone running this repo locally via docker-compose.
 * infra/terraform/modules/vault-config provisions the real thing.
 */

type VaultDbCredentials = {
  connectionString: string;
  leaseId: string | null;
  leaseDurationSeconds: number | null;
};

let cached: { creds: VaultDbCredentials; expiresAt: number } | null = null;

function buildConnectionString(username: string, password: string): string {
  const host = process.env.PGHOST;
  const port = process.env.PGPORT ?? "5432";
  const database = process.env.PGDATABASE ?? "meridian";
  if (!host) {
    throw new Error(
      "PGHOST is not set. When VAULT_ADDR is configured, PGHOST/PGPORT/PGDATABASE " +
        "must point at the RDS instance Vault issues credentials for (see " +
        "infra/terraform/modules/aws-database outputs).",
    );
  }
  const encodedUser = encodeURIComponent(username);
  const encodedPass = encodeURIComponent(password);
  return `postgres://${encodedUser}:${encodedPass}@${host}:${port}/${database}?sslmode=require`;
}

/**
 * Resolves the Vercel OIDC token for the current invocation.
 *
 * In a Function handler, Vercel makes this available as the
 * VERCEL_OIDC_TOKEN environment variable (builds) and additionally as the
 * `x-vercel-oidc-token` request header (runtime). We check both so this
 * works whether it's called during a build step or a request.
 * https://vercel.com/docs/oidc
 */
function getVercelOidcToken(headers?: Pick<Headers, "get">): string {
  const fromHeader = headers?.get("x-vercel-oidc-token");
  const fromEnv = process.env.VERCEL_OIDC_TOKEN;
  const token = fromHeader ?? fromEnv;
  if (!token) {
    throw new Error(
      "No Vercel OIDC token available (VERCEL_OIDC_TOKEN unset, no " +
        "x-vercel-oidc-token header). This is expected outside of a Vercel " +
        "deployment — set DATABASE_URL for local development instead.",
    );
  }
  return token;
}

// HCP Vault Dedicated reserves the root namespace for HashiCorp's own
// platform operations (not customer-accessible) — every resource this app
// talks to actually lives under the "admin" namespace Terraform creates it
// in (see infra/terraform/versions.tf's provider "vault" block). Every
// Vault API call below must carry this header, or Vault resolves the
// request against the (empty) root namespace and reports the role/path as
// not found even though it exists.
function vaultNamespaceHeaders(): Record<string, string> {
  const namespace = process.env.VAULT_NAMESPACE;
  return namespace ? { "X-Vault-Namespace": namespace } : {};
}

async function loginToVaultWithOidc(
  vaultAddr: string,
  headers?: Pick<Headers, "get">,
): Promise<string> {
  const jwt = getVercelOidcToken(headers);
  const role = process.env.VAULT_JWT_AUTH_ROLE ?? "vercel-app";

  const res = await fetch(`${vaultAddr}/v1/auth/jwt/login`, {
    method: "POST",
    headers: { "content-type": "application/json", ...vaultNamespaceHeaders() },
    body: JSON.stringify({ role, jwt }),
  });

  if (!res.ok) {
    throw new Error(`Vault JWT login failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { auth?: { client_token?: string } };
  const clientToken = body.auth?.client_token;
  if (!clientToken) {
    throw new Error("Vault JWT login response missing auth.client_token");
  }
  return clientToken;
}

async function readDynamicDbCredentials(
  vaultAddr: string,
  vaultToken: string,
): Promise<VaultDbCredentials> {
  const dbRole = process.env.VAULT_DB_ROLE ?? "meridian-app-role";

  const res = await fetch(`${vaultAddr}/v1/database/creds/${dbRole}`, {
    headers: { "X-Vault-Token": vaultToken, ...vaultNamespaceHeaders() },
  });

  if (!res.ok) {
    throw new Error(`Vault dynamic credential read failed: ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as {
    lease_id?: string;
    lease_duration?: number;
    data?: { username?: string; password?: string };
  };

  const username = body.data?.username;
  const password = body.data?.password;
  if (!username || !password) {
    throw new Error("Vault database secrets engine response missing username/password");
  }

  return {
    connectionString: buildConnectionString(username, password),
    leaseId: body.lease_id ?? null,
    leaseDurationSeconds: body.lease_duration ?? null,
  };
}

/**
 * Returns a Postgres connection string, sourced from HCP Vault's dynamic
 * database secrets engine in production, or DATABASE_URL locally.
 *
 * Credentials are cached in-process for 80% of their lease duration so we
 * don't call out to Vault on every request, then refreshed automatically.
 */
export async function getDatabaseConnectionString(headers?: Pick<Headers, "get">): Promise<string> {
  const staticUrl = process.env.DATABASE_URL;
  const vaultAddr = process.env.VAULT_ADDR;

  if (staticUrl) {
    // Local-dev / demo fallback path — see module comment above.
    return staticUrl;
  }

  if (!vaultAddr) {
    throw new Error(
      "Neither DATABASE_URL nor VAULT_ADDR is set. Set DATABASE_URL for local " +
        "development (see .env.example), or VAULT_ADDR + PGHOST for the " +
        "production Vault-backed path.",
    );
  }

  if (cached && cached.expiresAt > Date.now()) {
    return cached.creds.connectionString;
  }

  const vaultToken = await loginToVaultWithOidc(vaultAddr, headers);
  const creds = await readDynamicDbCredentials(vaultAddr, vaultToken);

  const ttlMs = (creds.leaseDurationSeconds ?? 300) * 1000 * 0.8;
  cached = { creds, expiresAt: Date.now() + ttlMs };

  return creds.connectionString;
}
