"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { MigrationCopilotUIMessage } from "@/workflows/migration-copilot/workflow";
import type { CopilotProviderRecord, MigrationCopilotRun } from "@/lib/db/schema";
import { tierForModelId } from "@/lib/ai/routing";

const SUGGESTIONS = [
  "What should we migrate first?",
  "How do we move /watchlist to Vercel?",
  "Walk me through migrating /api/profile safely.",
  "What's the rollback plan for /admin/reports?",
];

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
function RunHistory({ trigger }: { trigger: number }) {
  const [runs, setRuns] = useState<MigrationCopilotRun[]>([]);

  // Re-fetches whenever `trigger` (messages.length from the parent)
  // changes — which happens naturally on every turn, so this needs no
  // separate "did a response just finish" state derived in another effect.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/migration-copilot/runs")
      .then((res) => (res.ok ? res.json() : { runs: [] }))
      .then((data: { runs: MigrationCopilotRun[] }) => {
        if (!cancelled) setRuns(data.runs);
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
              <td>{new Date(run.createdAt).toLocaleTimeString()}</td>
              <td>
                {providerSummary(run.providers)}
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
  );
}

export function ChatPanel() {
  // Typed via MigrationCopilotUIMessage (inferred from the DurableAgent in
  // workflows/migration-copilot/workflow.ts), so message.parts is a real
  // discriminated union, not `unknown[]`. The `as unknown as {...}` cast
  // below is still needed anyway: `part.type.startsWith("tool-")` renders
  // every tool uniformly without switching on each tool's literal type
  // name, and TypeScript can't narrow a union on `.startsWith()` — only on
  // `===`. Switching on each `tool-<name>` literal would get real
  // per-tool narrowing from this type instead, at the cost of one case
  // per tool.
  const { messages, sendMessage, status, error } = useChat<MigrationCopilotUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
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
                return <span key={i}>{part.text}</span>;
              }
              if (part.type.startsWith("tool-")) {
                const toolName = part.type.replace("tool-", "");
                const p = part as unknown as {
                  state?: string;
                  input?: unknown;
                  output?: unknown;
                };
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
        style={{ display: "flex", gap: 10 }}
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
