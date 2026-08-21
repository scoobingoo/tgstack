import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // SWC keeps `emitDecoratorMetadata`, which Nest's DI relies on.
  plugins: [swc.vite()],
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    globalSetup: ["test/global-setup.ts"],
    // Integration tests share one Postgres database and one Redis DB.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
