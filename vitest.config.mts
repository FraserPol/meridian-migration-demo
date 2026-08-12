import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirrors tsconfig.json's "@/*" -> "./*" path alias, which Vitest doesn't
// pick up automatically the way Next.js's own bundler does.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
