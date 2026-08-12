"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { MigrationCopilotUIMessage } from "@/workflows/migration-copilot/workflow";

const SUGGESTIONS = [
  "What should we migrate first?",
  "How do we move /watchlist to Vercel?",
  "Walk me through migrating /api/profile safely.",
  "What's the rollback plan for /admin/reports?",
];

export function ChatPanel() {
  // Typed via MigrationCopilotUIMessage (inferred from the DurableAgent in
  // workflows/migration-copilot/workflow.ts) so each tool-* message part
  // below is known at compile time instead of cast through `unknown`.
  const { messages, sendMessage, status } = useChat<MigrationCopilotUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");

  const isBusy = status === "submitted" || status === "streaming";

  function submit(text: string) {
    if (!text.trim() || isBusy) return;
    sendMessage({ text });
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
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        style={{ display: "flex", gap: 10, marginTop: 16 }}
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
    </div>
  );
}
