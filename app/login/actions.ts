"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { checkBotId } from "botid/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession, VaultUnavailableError, VAULT_UNAVAILABLE_MESSAGE } from "@/lib/session";
import { verifyPassword } from "@/lib/password";

export type LoginState = { error?: string } | undefined;

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter both an email and a password." };
  }

  // Bot check before any credential work: a blocked request should cost no
  // database round-trip and, more importantly, no password comparison —
  // otherwise this action is still a usable credential-stuffing oracle,
  // just a slower one. See instrumentation-client.ts for the paired client
  // registration; a path missing there makes this call fail.
  //
  // BOTID_ENFORCE=0 downgrades this to observe-only. BotID classifies from
  // a browser challenge, so a mistake here locks real people out of the
  // app; the switch is the way back in without waiting on a code change.
  if (process.env.BOTID_ENFORCE !== "0") {
    const verification = await checkBotId();
    if (verification.isBot) {
      return { error: "This request looked automated. Please try again from a normal browser." };
    }
  }

  const hdrs = await headers();

  let user;
  try {
    const db = await getDb(hdrs);
    [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  } catch (err) {
    if (err instanceof VaultUnavailableError) return { error: VAULT_UNAVAILABLE_MESSAGE };
    throw err;
  }

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Invalid email or password." };
  }

  try {
    await createSession({ userId: user.id, email: user.email, role: user.role }, hdrs);
  } catch (err) {
    if (err instanceof VaultUnavailableError) return { error: VAULT_UNAVAILABLE_MESSAGE };
    throw err;
  }
  redirect(user.role === "admin" ? "/admin/migration-copilot" : "/dashboard");
}
