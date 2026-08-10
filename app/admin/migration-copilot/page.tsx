import { ChatPanel } from "./chat-panel";

export default function MigrationCopilotPage() {
  return (
    <>
      <h1>Migration Copilot</h1>
      <p style={{ color: "var(--muted)", marginTop: -8, marginBottom: 24 }}>
        Ask about any route in Meridian&apos;s legacy AWS/EKS app. The Copilot looks up the real
        (mocked) inventory, recommends an{" "}
        <a href="https://vercel.com/docs/incremental-migration" target="_blank" rel="noreferrer">
          incremental migration
        </a>{" "}
        strategy, and generates the config to execute it — it never guesses at any of the three.
      </p>
      <ChatPanel />
    </>
  );
}
