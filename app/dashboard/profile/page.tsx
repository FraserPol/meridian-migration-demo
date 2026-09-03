import { Suspense } from "react";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getSession, VaultUnavailableError, VAULT_UNAVAILABLE_MESSAGE } from "@/lib/session";
import { getDb } from "@/lib/db";
import { profiles, type Profile } from "@/lib/db/schema";
import { ProfileForm } from "./profile-form";

// The session-gated DB read is isolated in <ProfileContent> below rather
// than running at this top level, so this page has no unconditional
// dynamic API call of its own — it can prerender a static loading frame
// instead of the whole route falling back to `export const instant =
// false` (see app/dashboard/page.tsx for the same split one level up).
export default function ProfilePage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--muted)" }}>Loading your profile…</p>}>
      <ProfileContent />
    </Suspense>
  );
}

async function ProfileContent() {
  let profile: Profile | undefined;
  try {
    const hdrs = await headers();
    const session = await getSession(hdrs);
    const db = await getDb(hdrs);

    [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, session!.userId))
      .limit(1);
  } catch (err) {
    if (err instanceof VaultUnavailableError) {
      // getSession()/getDb() each mint their own Vault credential,
      // independently of dashboard/layout.tsx's own getSession() call — a
      // Vault blip here needs the same graceful handling, not a crash to
      // the generic error boundary (see lib/session.ts).
      return <p>{VAULT_UNAVAILABLE_MESSAGE}</p>;
    }
    throw err;
  }

  return (
    <>
      <h1>{profile ? "Edit profile" : "Create your profile"}</h1>
      <div className="card">
        <ProfileForm profile={profile} />
      </div>
    </>
  );
}
