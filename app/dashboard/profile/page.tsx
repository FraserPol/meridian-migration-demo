import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { ProfileForm } from "./profile-form";

// Reads the session cookie and a live per-user DB read — request-time by
// design. See next.config.ts.
export const instant = false;

export default async function ProfilePage() {
  const hdrs = await headers();
  const session = await getSession(hdrs);
  const db = await getDb(hdrs);

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, session!.userId))
    .limit(1);

  return (
    <>
      <h1>{profile ? "Edit profile" : "Create your profile"}</h1>
      <div className="card">
        <ProfileForm profile={profile} />
      </div>
    </>
  );
}
