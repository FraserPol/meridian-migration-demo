"use client";

import { useActionState } from "react";
import { addTicker } from "./actions";

export function AddTickerForm() {
  const [state, formAction, pending] = useActionState(addTicker, undefined);

  return (
    <form action={formAction} className="inline-form" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 120 }}>
        <label htmlFor="ticker">Ticker symbol</label>
        <input id="ticker" name="ticker" placeholder="e.g. AAPL" maxLength={6} required />
      </div>
      <button type="submit" disabled={pending} style={{ marginTop: 14 }}>
        {pending ? "Adding..." : "Add"}
      </button>
      {state?.error && (
        <div className="error-banner" role="alert" style={{ width: "100%" }}>
          {state.error}
        </div>
      )}
    </form>
  );
}
