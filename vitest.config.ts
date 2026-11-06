import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/web/**/*.test.ts"],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@clipppy/contracts": path.resolve("packages/contracts/src/index.ts"),
      "@clipppy/domain": path.resolve("packages/domain/src/index.ts"),
      "@clipppy/ingest": path.resolve("packages/ingest/src/index.ts"),
      "@clipppy/publish": path.resolve("packages/publish/src/index.ts"),
      "@clipppy/jobs": path.resolve("packages/jobs/src/index.ts"),
      "@clipppy/db": path.resolve("packages/db/src/index.ts"),
    },
  },
});
