"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { getSession, VaultUnavailableError, VAULT_UNAVAILABLE_MESSAGE } from "@/lib/session";

export type ProfileState = { error?: string; success?: boolean } | undefined;

export async function saveProfile(
  _prevState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const hdrs = await headers();

  let session;
  try {
    session = await getSession(hdrs);
  } catch (err) {
    if (err instanceof VaultUnavailableError) return { error: VAULT_UNAVAILABLE_MESSAGE };
    throw err;
  }
  if (!session) return { error: "Not signed in." };

  const displayName = String(formData.get("displayName") ?? "").trim();
  const investmentGoal = String(formData.get("investmentGoal") ?? "").trim();
  const riskTolerance = String(formData.get("riskTolerance") ?? "balanced");

  if (!displayName || !investmentGoal) {
    return { error: "Name and investment goal are required." };
  }

  try {
    const db = await getDb(hdrs);
    await db
      .insert(profiles)
      .values({ userId: session.userId, displayName, investmentGoal, riskTolerance })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { displayName, investmentGoal, riskTolerance },
      });
  } catch (err) {
    if (err instanceof VaultUnavailableError) return { error: VAULT_UNAVAILABLE_MESSAGE };
    throw err;
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  return { success: true };
}
