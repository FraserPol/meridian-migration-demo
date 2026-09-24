"use client";

import { useRef, useState } from "react";

/**
 * Wraps the Copilot's fenced code blocks with a copy button. The whole
 * point of the tool is the config it generates, and without this the only
 * way to get that config out is selecting it by hand — which is exactly
 * the moment a demo stalls.
 *
 * Reads the rendered text from the DOM rather than the markdown source:
 * react-markdown hands `children` as a React node tree, and the text a
 * person sees is what they expect to land on the clipboard.
 */
export function CodeBlock({ children }: { children?: React.ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = preRef.current?.innerText ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied or unavailable outside a secure
      // context; the code is still on screen and selectable.
    }
  }

  return (
    <div className="code-block">
      <button type="button" className="code-copy" onClick={copy} aria-label="Copy code">
        {copied ? "Copied ✓" : "Copy"}
      </button>
      <pre ref={preRef}>{children}</pre>
    </div>
  );
}
