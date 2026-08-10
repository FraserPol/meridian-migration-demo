"use client";

import { useActionState } from "react";
import { saveProfile } from "./actions";
import type { Profile } from "@/lib/db/schema";

export function ProfileForm({ profile }: { profile?: Profile }) {
  const [state, formAction, pending] = useActionState(saveProfile, undefined);

  return (
    <form action={formAction}>
      <label htmlFor="displayName">Display name</label>
      <input
        id="displayName"
        name="displayName"
        defaultValue={profile?.displayName}
        required
      />

      <label htmlFor="investmentGoal">Investment goal</label>
      <input
        id="investmentGoal"
        name="investmentGoal"
        defaultValue={profile?.investmentGoal}
        placeholder="e.g. Long-term growth, retirement savings, short-term trading"
        required
      />

      <label htmlFor="riskTolerance">Risk tolerance</label>
      <select id="riskTolerance" name="riskTolerance" defaultValue={profile?.riskTolerance ?? "balanced"}>
        <option value="conservative">Conservative</option>
        <option value="balanced">Balanced</option>
        <option value="aggressive">Aggressive</option>
      </select>

      {state?.error && <div className="error-banner">{state.error}</div>}
      {state?.success && (
        <div className="error-banner" style={{ color: "var(--green)", borderColor: "rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.1)" }}>
          Saved.
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save profile"}
        </button>
      </div>
    </form>
  );
}
