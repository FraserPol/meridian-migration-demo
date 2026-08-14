"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
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
