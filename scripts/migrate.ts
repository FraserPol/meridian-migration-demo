/**
 * Applies drizzle/ SQL migrations against DATABASE_URL. Run this against
 * the local docker-compose Postgres, or against a real AWS RDS instance
 * once infra/terraform has provisioned one (point DATABASE_URL at it
 * temporarily for this one-time bootstrap — after that, the app itself
 * reads credentials from Vault, not DATABASE_URL).
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Set DATABASE_URL before running db:migrate (see .env.example).");
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  console.log("Applying migrations from ./drizzle ...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Done.");

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
