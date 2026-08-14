"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <main className="auth-page">
      <div className="card">
        <h1>Meridian Capital</h1>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>
          Portfolio Watchlist — Vercel SA take-home demo
        </p>

        <form action={formAction}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />

          {state?.error && (
            <div className="error-banner" role="alert">
              {state.error}
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <button type="submit" disabled={pending}>
              {pending ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>

        <div className="demo-creds">
          <strong>Demo accounts</strong> (password for all: <code>VercelDemo!2026</code>)
          <br />
          <code>jordan.reyes@meridiancapital.demo</code> — customer, populated watchlist
          <br />
          <code>alex.chen@meridiancapital.demo</code> — customer, no profile yet
          <br />
          <code>admin@meridiancapital.demo</code> — admin, Migration Copilot
        </div>
      </div>
    </main>
  );
}
