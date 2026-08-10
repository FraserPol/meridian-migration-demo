import "server-only";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDatabaseConnectionString } from "@/lib/vault";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

let cachedConnectionString: string | null = null;
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
export async function getDb(headers?: Headers): Promise<Db> {
  const connectionString = await getDatabaseConnectionString(headers);

  if (cachedDb && cachedConnectionString === connectionString) {
    return cachedDb;
  }

  const client = postgres(connectionString, { max: 5 });
  cachedDb = drizzle(client, { schema });
  cachedConnectionString = connectionString;
  return cachedDb;
}

export { schema };
