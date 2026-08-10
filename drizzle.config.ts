import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // drizzle-kit only needs this for `db:generate` / local pushes; the
    // running app resolves its connection through lib/db/index.ts, which
    // goes through lib/vault.ts instead of reading this file.
    url: process.env.DATABASE_URL ?? "postgres://meridian:meridian@localhost:5432/meridian",
  },
});
