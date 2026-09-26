import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    globals: true,
    env: {
      USE_REAL_DATA: "true",
      JWT_SECRET: "test-secret-key",
      OPENAI_API_KEY: "",
    },
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      // Business logic only — UI/pages are exercised by the typed build + (future) E2E.
      include: [
        "src/lib/ani/**",
        "src/lib/data/**",
        "src/lib/server/**",
        "src/lib/format.ts",
        "src/lib/utils.ts",
      ],
      // 100% functions, ~100% lines/statements. Branches gate set to the achieved
      // level — the rest are defensive fallbacks (`?? default`, optional args).
      thresholds: { lines: 99, functions: 100, branches: 85, statements: 99 },
    },
  },
});
