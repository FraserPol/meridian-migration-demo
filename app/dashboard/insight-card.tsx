"use client";

import { useActionState } from "react";
import Markdown from "react-markdown";
import { requestInsight } from "./insight-actions";

/**
 * Customer-facing AI panel. Generation is explicit rather than automatic
 * on page load: an insight costs a model call, and a dashboard that bills
 * every time someone glances at it is how AI features become
 * indefensible. Once generated it's cached until the portfolio changes
 * (see insight-actions.ts), so re-reading is free.
 */
export function InsightCard({
  insight,
  createdAt,
  stale,
}: {
  insight: string | null;
  createdAt: Date | null;
  stale: boolean;
}) {
  const [state, formAction, pending] = useActionState(requestInsight, undefined);

  return (
    <div className="card insight-card">
      <div className="insight-header">
        <h2>Portfolio insight</h2>
        <span className="insight-tag">AI generated</span>
      </div>

      {insight ? (
        <>
          {stale && (
            <p className="insight-stale">
              Your portfolio has changed since this was written.
            </p>
          )}
          <div className="chat-markdown insight-body">
            <Markdown>{insight}</Markdown>
          </div>
          <div className="insight-footer">
            {createdAt && (
              <span>
                Generated{" "}
                {new Date(createdAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            )}
            <form action={formAction}>
              <button type="submit" className="link-button" disabled={pending}>
                {pending ? "Refreshing…" : stale ? "Refresh insight" : "Regenerate"}
              </button>
            </form>
          </div>
        </>
      ) : (
        <>
          <p style={{ color: "var(--muted)" }}>
            Get a short read on what your portfolio is concentrated in and whether that fits the
            risk tolerance on your profile.
          </p>
          <form action={formAction}>
            <button type="submit" disabled={pending}>
              {pending ? "Analysing…" : "Generate insight"}
            </button>
          </form>
        </>
      )}

      {state?.error && (
        <div className="error-banner" role="alert" style={{ marginTop: 12 }}>
          {state.error}
        </div>
      )}

      <p className="insight-disclaimer">
        General information based on your holdings — not personalised financial advice.
      </p>
    </div>
  );
}
