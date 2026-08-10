import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const session = await getSession();
  const db = await getDb();

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
