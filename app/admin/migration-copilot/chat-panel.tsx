"use client";

import { useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { MigrationCopilotUIMessage } from "@/workflows/migration-copilot/workflow";
import type { CopilotProviderRecord, MigrationCopilotRun } from "@/lib/db/schema";

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
  const unique = [...new Set(providers.map((p) => p.provider))];
  return unique.join(" → ");
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
      <h2 style={{ fontSize: 14, marginBottom: 8 }}>Recent runs (audit trail)</h2>
      <table style={{ width: "100%", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--muted)" }}>
            <th>When</th>
            <th>Provider</th>
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
                    title="Failover-explanation toggle was on for this run — see chat-panel.tsx. Doesn't force a real provider failure; the provider column above is still the real serving provider."
                    style={{ marginLeft: 6, opacity: 0.7 }}
                  >
                    🔧
                  </span>
                )}
              </td>
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
  // workflows/migration-copilot/workflow.ts) so each tool-* message part
  // below is known at compile time instead of cast through `unknown`.
  const { messages, sendMessage, status, error } = useChat<MigrationCopilotUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");
  const [simulateFailover, setSimulateFailover] = useState(false);

  const isBusy = status === "submitted" || status === "streaming";

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

      <div className="chat-log">
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

      <label
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginTop: 12 }}
        title="Doesn't force a real Bedrock outage — there's no safe way to fault-inject just one leg of AI Gateway's order config without risking a hard error on the whole request. Asks the model to narrate the real failover mechanism instead, and badges this run in the audit trail below."
      >
        <input
          type="checkbox"
          checked={simulateFailover}
          onChange={(e) => setSimulateFailover(e.target.checked)}
        />
        Explain provider failover in the response (illustrative — see tooltip)
      </label>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        style={{ display: "flex", gap: 10, marginTop: 8 }}
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
