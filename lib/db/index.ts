import "server-only";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDatabaseConnectionString } from "@/lib/vault";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

let cachedConnectionString: string | null = null;
let cachedClient: ReturnType<typeof postgres> | null = null;
let cachedDb: Db | null = null;

/**
 * Lazily resolves a database connection.
 *
 * Deliberately NOT instantiated at module load time: the connection
 * string may come from a short-lived Vault lease (see lib/vault.ts), and
 * resolving it eagerly at import time would run at build time in some
 * Next.js execution paths, before there's a request context to source an
 * OIDC token from. Every call re-checks the (cached, TTL-aware) credential.
 */
export async function getDb(headers?: Pick<Headers, "get">): Promise<Db> {
  const connectionString = await getDatabaseConnectionString(headers);

  if (cachedDb && cachedConnectionString === connectionString) {
    return cachedDb;
  }

  const oldClient = cachedClient;

  const client = postgres(connectionString, { max: 5 });
  cachedClient = client;
  cachedDb = drizzle(client, { schema });
  cachedConnectionString = connectionString;

  // Vault credential rotation means this fires with a still-live old
  // client — its pool has open TCP connections that would otherwise leak
  // for the lifetime of the process. Give in-flight queries a grace
  // period to finish, then close it; don't await it, rotation shouldn't
  // block on the old pool draining.
  if (oldClient) {
    void oldClient.end({ timeout: 5 });
  }

  return cachedDb;
}

export { schema };
