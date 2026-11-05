import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      // The framework-free core is what unit tests must cover; the vscode-host
      // adapter is exercised by the bundle smoke test instead.
      include: ["src/core/**", "src/util/**"],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
});
