import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getSession, VaultUnavailableError, VAULT_UNAVAILABLE_MESSAGE } from "@/lib/session";
import { getDb } from "@/lib/db";
import { profiles, type Profile } from "@/lib/db/schema";
import { ProfileForm } from "./profile-form";

// Reads the session cookie and a live per-user DB read — request-time by
// design. See next.config.ts.
export const instant = false;

export default async function ProfilePage() {
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
