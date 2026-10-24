import path from "node:path";
import { defineConfig } from "vitest/config";

/** Opt-in integration tests against the local Ollama server only. No paid APIs. */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty-module.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/support/network-guard.ts"],
    testTimeout: 300_000,
  },
});
