"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <main className="auth-page">
      <div className="card auth-card">
        <div className="brand-mark" aria-hidden="true">
          MC
        </div>
        <h1>Meridian Capital</h1>
        <p className="auth-subtitle">Portfolio Watchlist — Vercel SA take-home demo</p>

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
            <button type="submit" disabled={pending} className="auth-submit">
              {pending ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>

        <div className="demo-creds">
          <div className="demo-creds-header">
            <span>Demo accounts</span>
            <span>
              password: <code>VercelDemo!2026</code>
            </span>
          </div>
          <ul className="demo-account-list">
            <li>
              <div className="demo-account-row">
                <code>jordan.reyes@meridiancapital.demo</code>
                <span className="badge">customer</span>
              </div>
              <span className="demo-account-desc">Populated watchlist</span>
            </li>
            <li>
              <div className="demo-account-row">
                <code>alex.chen@meridiancapital.demo</code>
                <span className="badge">customer</span>
              </div>
              <span className="demo-account-desc">No profile yet — onboarding flow</span>
            </li>
            <li>
              <div className="demo-account-row">
                <code>admin@meridiancapital.demo</code>
                <span className="badge">admin</span>
              </div>
              <span className="demo-account-desc">Migration Copilot</span>
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
