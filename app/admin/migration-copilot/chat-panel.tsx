"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { WorkflowChatTransport } from "@ai-sdk/workflow";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MigrationCopilotUIMessage } from "@/workflows/migration-copilot/workflow";
import type { CopilotProviderRecord, MigrationCopilotRun } from "@/lib/db/schema";
import { tierForModelId } from "@/lib/ai/routing";

const SUGGESTIONS = [
  "What should we migrate first?",
  "How do we move /watchlist to Vercel?",
  "Walk me through migrating /api/profile safely.",
  "What's the rollback plan for /admin/reports?",
];

// sessionStorage, not localStorage: an in-flight run is only worth
// rejoining for the life of this tab. Scoped per-tab so two tabs don't
// fight over one run id.
const RUN_ID_KEY = "migration-copilot:run-id";

// Module scope, not component state: the transport has to outlive a
// remount for a reconnect to still know which run it was following, and
// the panel is a singleton on this page. Nothing here touches `window` at
// import time, so it stays safe to evaluate during prerender.
let currentRunId: string | null = null;

function rememberRunId(runId: string | null) {
  currentRunId = runId;
  try {
    if (runId) window.sessionStorage.setItem(RUN_ID_KEY, runId);
    else window.sessionStorage.removeItem(RUN_ID_KEY);
  } catch {
    // Private mode or blocked storage: in-memory tracking still covers
    // mid-session reconnects; only reload recovery is lost.
  }
}

/**
 * WorkflowChatTransport rather than DefaultChatTransport: when a response
 * stream ends without a `finish` chunk — a Function hitting maxDuration
 * mid-answer, a dropped connection — it reconnects to the still-running
 * workflow using the run id from the POST's x-workflow-run-id header and
 * resumes at the chunk it had already consumed, instead of losing the
 * answer. The run id is also persisted so a full page reload can rejoin
 * an answer that is still being generated.
 */
const copilotTransport = new WorkflowChatTransport<MigrationCopilotUIMessage>({
  api: "/api/chat",
  onChatSendMessage: (response) => {
    const runId = response.headers.get("x-workflow-run-id");
    if (runId) rememberRunId(runId);
  },
  onChatEnd: () => rememberRunId(null),
  // The transport reconnects by chat id by default; this app's runs are
  // addressed by workflow run id (app/api/chat/[runId]/stream), so the URL
  // is rebuilt around the run we actually recorded.
  //
  // The `api` argument is the transport's complete default URL
  // (`/api/chat/<chatId>/stream`), not the base — appending to it produces a
  // path that matches no route. It's rebuilt from scratch instead.
  //
  // sessionStorage is read here rather than relied on from `currentRunId`
  // alone: after a reload this runs during resume, and reading at call time
  // removes any dependence on the recovery effect having assigned first.
  prepareReconnectToStreamRequest: ({ id }) => {
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(RUN_ID_KEY);
    } catch {
      // Storage unavailable — fall back to whatever is in memory.
    }
    return { api: `/api/chat/${encodeURIComponent(currentRunId ?? stored ?? id)}/stream` };
  },
});

function formatCost(usd: string): string {
  const n = Number(usd);
  return n < 0.01 ? `<$0.01` : `$${n.toFixed(2)}`;
}

function providerSummary(providers: CopilotProviderRecord[]): string {
  // Classifier row (lib/ai/routing.ts) is a separate cost/audit line, not
  // part of "which provider served the answer" — excluded here.
  const agentProviders = providers.filter((p) => p.role !== "classifier");
  const unique = [...new Set(agentProviders.map((p) => p.provider))];
  return unique.join(" → ");
}

function tierSummary(providers: CopilotProviderRecord[]): string {
  const agentProvider = providers.find((p) => p.role !== "classifier");
  return agentProvider ? tierForModelId(agentProvider.modelId) : "—";
}

function classifierNote(providers: CopilotProviderRecord[]): string | undefined {
  return providers.find((p) => p.role === "classifier")?.note;
}

/**
 * Reads workflows/migration-copilot/workflow.ts's audit trail
 * (migration_copilot_runs, via app/api/migration-copilot/runs) so
 * cost/tokens/provider-per-run are something to click through live,
 * not just a claim about a dashboard nobody in the room can see.
 */
type BudgetStatus = {
  spentTodayUsd: number;
  limitUsd: number;
  remainingUsd: number;
  exceeded: boolean;
};

function RunHistory({ trigger }: { trigger: number }) {
  const [runs, setRuns] = useState<MigrationCopilotRun[]>([]);
  const [budget, setBudget] = useState<BudgetStatus | null>(null);

  // Re-fetches whenever `trigger` (messages.length from the parent)
  // changes — which happens naturally on every turn, so this needs no
  // separate "did a response just finish" state derived in another effect.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/migration-copilot/runs")
      .then((res) => (res.ok ? res.json() : { runs: [] }))
      .then((data: { runs: MigrationCopilotRun[]; budget?: BudgetStatus }) => {
        if (cancelled) return;
        setRuns(data.runs);
        setBudget(data.budget ?? null);
      })
      .catch(() => {
        // Best-effort — the chat itself already succeeded if we're here.
      });
    return () => {
      cancelled = true;
    };
  }, [trigger]);

  if (runs.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2>Recent runs (audit trail)</h2>
      {budget && (
        <div className={`budget-meter${budget.exceeded ? " budget-exceeded" : ""}`}>
          <div className="budget-line">
            <span>
              Spend today — <strong>${budget.spentTodayUsd.toFixed(2)}</strong> of $
              {budget.limitUsd.toFixed(2)}
            </span>
            <span className="budget-remaining">
              {budget.exceeded
                ? "budget reached — runs paused until 00:00 UTC"
                : `$${budget.remainingUsd.toFixed(2)} left`}
            </span>
          </div>
          <div className="budget-track">
            <div
              className="budget-fill"
              style={{
                width: `${Math.min(100, (budget.spentTodayUsd / budget.limitUsd) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
      <div className="table-scroll">
      <table style={{ width: "100%", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--muted)" }}>
            <th>When</th>
            <th>Provider</th>
            <th>Tier</th>
            <th>Tokens</th>
            <th>Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>
                {new Date(run.createdAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </td>
              <td>
                {providerSummary(run.providers)}
                {run.errorMessage && (
                  <span
                    title={`This run failed: ${run.errorMessage}`}
                    style={{ marginLeft: 6, color: "var(--danger, #c0392b)" }}
                  >
                    ⚠️ failed
                  </span>
                )}
                {run.simulatedFailureRequested && (
                  <span
                    title="Live-failover-demo toggle was on for this run — the primary model was deliberately broken, so the provider/tier shown here is AI Gateway's real fallback model, not the primary."
                    style={{ marginLeft: 6, opacity: 0.7 }}
                  >
                    🔧
                  </span>
                )}
              </td>
              <td title={classifierNote(run.providers) ?? ""}>{tierSummary(run.providers)}</td>
              <td>{run.totalTokens.toLocaleString()}</td>
              <td>{formatCost(run.estimatedCostUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export function ChatPanel() {
  // Typed via MigrationCopilotUIMessage (inferred from the Migration
  // Copilot's tool set in workflows/migration-copilot/workflow.ts), so message.parts is a real
  // discriminated union, not `unknown[]`. The `as unknown as {...}` cast
  // below is still needed anyway: `part.type.startsWith("tool-")` renders
  // every tool uniformly without switching on each tool's literal type
  // name, and TypeScript can't narrow a union on `.startsWith()` — only on
  // `===`. Switching on each `tool-<name>` literal would get real
  // per-tool narrowing from this type instead, at the cost of one case
  // per tool.
  const { messages, sendMessage, status, error, addToolApprovalResponse, resumeStream } =
    useChat<MigrationCopilotUIMessage>({
      transport: copilotTransport,
      // After the admin approves or denies, the decision has to go back to
      // the paused run for it to continue — this resends automatically
      // instead of making them type another message to unblock the agent.
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    });
  const [input, setInput] = useState("");
  const [simulateFailover, setSimulateFailover] = useState(false);

  const isBusy = status === "submitted" || status === "streaming";

  // Auto-follow the response as it streams in, instead of leaving the log
  // scrolled wherever it was and making the user manually chase new text
  // down. stickToBottomRef tracks whether the user was already at the
  // bottom before this update — if they've deliberately scrolled up to
  // read earlier messages mid-stream, we don't yank them back down.
  const chatLogRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  function handleChatLogScroll() {
    const el = chatLogRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  }

  useEffect(() => {
    const el = chatLogRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isBusy]);

  // Reload recovery: if this tab was watching a run that never reported a
  // `finish`, rejoin it. startIndex is negative so a reloaded page gets the
  // tail of what it missed rather than replaying the whole answer.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(RUN_ID_KEY);
    } catch {
      return;
    }
    if (!stored) return;
    currentRunId = stored;
    resumeStream().catch(() => {
      // The run already finished, expired, or isn't ours — nothing to
      // rejoin, so drop the pointer and start clean.
      rememberRunId(null);
    });
  }, [resumeStream]);

  function submit(text: string) {
    if (!text.trim() || isBusy) return;
    sendMessage({ text }, { body: { simulateFailover } });
    setInput("");
  }

  return (
    <div className="card">
      {messages.length === 0 && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => submit(s)} type="button">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="chat-log" ref={chatLogRef} onScroll={handleChatLogScroll}>
        {messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.role}`}>
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                // The model is prompted to answer in markdown, so the
                // assistant's text is rendered rather than shown raw. User
                // text stays plain — it's typed, not generated, and
                // rendering it would let a pasted `#` silently become a
                // heading. react-markdown does not render raw HTML unless
                // rehype-raw is added, so model output can't inject markup.
                return message.role === "assistant" ? (
                  <div key={i} className="chat-markdown">
                    <Markdown remarkPlugins={[remarkGfm]}>{part.text}</Markdown>
                  </div>
                ) : (
                  <span key={i}>{part.text}</span>
                );
              }
              if (part.type.startsWith("tool-")) {
                const toolName = part.type.replace("tool-", "");
                const p = part as unknown as {
                  state?: string;
                  input?: unknown;
                  output?: unknown;
                  approval?: { id: string; approved?: boolean; reason?: string };
                };

                // A gated tool (lib/ai/tools.ts `needsApproval`) parks the
                // whole run here until the admin decides. Approving or
                // denying resends automatically via sendAutomaticallyWhen.
                if (p.state === "approval-requested" && p.approval) {
                  const approvalId = p.approval.id;
                  return (
                    <div key={i} className="approval-request">
                      <div className="approval-title">
                        Approval required — <code>{toolName}</code>
                      </div>
                      <p className="approval-body">
                        This tool generates the routing configuration that would move traffic
                        for a live route. It does not run until you approve it.
                      </p>
                      {p.input !== undefined && (
                        <pre>{JSON.stringify(p.input, null, 2).slice(0, 600)}</pre>
                      )}
                      <div className="approval-actions">
                        <button
                          type="button"
                          onClick={() => addToolApprovalResponse({ id: approvalId, approved: true })}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="approval-deny"
                          onClick={() =>
                            addToolApprovalResponse({
                              id: approvalId,
                              approved: false,
                              reason: "Denied by admin in the Migration Copilot UI.",
                            })
                          }
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  );
                }

                if (p.state === "output-denied") {
                  return (
                    <div key={i} className="tool-call tool-call-denied">
                      <strong>tool:</strong> {toolName} <span>(denied — not executed)</span>
                      {p.approval?.reason && <div>{p.approval.reason}</div>}
                    </div>
                  );
                }

                return (
                  <div key={i} className="tool-call">
                    <strong>tool:</strong> {toolName}{" "}
                    {p.state && <span style={{ opacity: 0.7 }}>({p.state})</span>}
                    {p.output !== undefined && (
                      <pre>{JSON.stringify(p.output, null, 2).slice(0, 1200)}</pre>
                    )}
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}
        {isBusy && <div className="chat-message assistant">Thinking…</div>}
        {status === "error" && (
          <div className="chat-message assistant" style={{ color: "var(--danger, #c0392b)" }}>
            Something went wrong generating a response
            {error?.message ? `: ${error.message}` : "."} Try asking again — see the server
            logs (or <code>npx workflow inspect runs</code>) for the underlying error.
          </div>
        )}
      </div>

      <div className="toolbar-row">
        <span className="switch">
          <input
            type="checkbox"
            checked={simulateFailover}
            onChange={(e) => setSimulateFailover(e.target.checked)}
            aria-describedby="failover-toggle-hint"
          />
          <span className="switch-track" />
          <span className="switch-thumb" />
        </span>
        <span>Trigger live model failover for this message</span>
        <span
          className="info-icon"
          id="failover-toggle-hint"
          title="Deliberately breaks the primary model slug so AI Gateway's real providerOptions.gateway.models fallback list has to serve the response — a live failover, not a narrated one. Check the Provider/Tier columns below after sending to see the fallback model that actually answered."
        >
          i
        </span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="inline-form"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a route, e.g. /watchlist"
          disabled={isBusy}
        />
        <button type="submit" disabled={isBusy || !input.trim()}>
          Send
        </button>
      </form>

      <RunHistory trigger={messages.length} />
    </div>
  );
}
