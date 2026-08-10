/**
 * Seeds three demo users so the interviewer/reviewer can log in without
 * creating an account first. Credentials are also documented in README.md.
 *
 * All three share one password on purpose (VercelDemo!2026) — this is a
 * public take-home demo repo with no real customer data behind it, so
 * optimizing for "easy to try in 30 seconds" beats per-user secrets here.
 * This would obviously not fly for a real Meridian deployment.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/password";
import { users, profiles, watchlistItems } from "@/lib/db/schema";

const DEMO_PASSWORD = "VercelDemo!2026";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Set DATABASE_URL before running db:seed (see .env.example).");
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  async function upsertUser(email: string, role: "customer" | "admin") {
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) return existing[0];
    const [created] = await db.insert(users).values({ email, passwordHash, role }).returning();
    return created;
  }

  // 1. Admin persona -> the legacy IT admin the Migration Copilot is built for.
  const admin = await upsertUser("admin@meridiancapital.demo", "admin");
  await db
    .insert(profiles)
    .values({
      userId: admin.id,
      displayName: "Priya Natarajan (IT Platform Admin)",
      investmentGoal: "N/A — internal admin account",
      riskTolerance: "n/a",
    })
    .onConflictDoNothing();

  // 2. Returning customer -> already onboarded, has a populated watchlist.
  const jordan = await upsertUser("jordan.reyes@meridiancapital.demo", "customer");
  await db
    .insert(profiles)
    .values({
      userId: jordan.id,
      displayName: "Jordan Reyes",
      investmentGoal: "Long-term growth",
      riskTolerance: "balanced",
    })
    .onConflictDoNothing();
  for (const { ticker, addedAtPrice } of [
    { ticker: "AAPL", addedAtPrice: "227.50" },
    { ticker: "MSFT", addedAtPrice: "418.20" },
    { ticker: "TSLA", addedAtPrice: "255.10" },
  ]) {
    await db
      .insert(watchlistItems)
      .values({ userId: jordan.id, ticker, addedAtPrice })
      .onConflictDoNothing();
  }

  // 3. New customer -> account exists, but no profile yet. Demonstrates the
  //    "create a profile" onboarding flow live.
  await upsertUser("alex.chen@meridiancapital.demo", "customer");

  console.log("Seed complete. Demo users:");
  console.log("  admin@meridiancapital.demo        (admin)    -> Migration Copilot");
  console.log("  jordan.reyes@meridiancapital.demo (customer) -> populated watchlist");
  console.log("  alex.chen@meridiancapital.demo     (customer) -> onboarding / no profile yet");
  console.log(`  password for all three: ${DEMO_PASSWORD}`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
