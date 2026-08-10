"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { getSession } from "@/lib/session";

export type ProfileState = { error?: string; success?: boolean } | undefined;

export async function saveProfile(
  _prevState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };

  const displayName = String(formData.get("displayName") ?? "").trim();
  const investmentGoal = String(formData.get("investmentGoal") ?? "").trim();
  const riskTolerance = String(formData.get("riskTolerance") ?? "balanced");

  if (!displayName || !investmentGoal) {
    return { error: "Name and investment goal are required." };
  }

  const db = await getDb();
  await db
    .insert(profiles)
    .values({ userId: session.userId, displayName, investmentGoal, riskTolerance })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: { displayName, investmentGoal, riskTolerance },
    });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  return { success: true };
}
