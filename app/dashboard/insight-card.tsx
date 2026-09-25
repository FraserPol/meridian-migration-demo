"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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

  // Collapsed by default. In the dashboard's narrow right-hand column a
  // four-paragraph insight runs several times the height of the account
  // cards beside it, which makes the commentary dominate the page it's
  // meant to sit alongside. The toggle only appears when the text actually
  // overflows, so a short insight doesn't get a button that does nothing —
  // that has to be measured after layout rather than guessed from string
  // length, since wrapping depends on the column width.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || expanded) return;
    // Only measured while collapsed: once expanded the clamp is lifted, so
    // scrollHeight and clientHeight match and this would conclude the text
    // no longer overflows, removing the control needed to collapse it again.
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 4);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [insight, expanded]);

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
          <div
            ref={bodyRef}
            className={`chat-markdown insight-body${expanded ? "" : " insight-body-clamped"}`}
          >
            <Markdown>{insight}</Markdown>
          </div>
          {(overflows || expanded) && (
            <button
              type="button"
              className="link-button insight-expand"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show less" : "Read full insight"}
            </button>
          )}
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
