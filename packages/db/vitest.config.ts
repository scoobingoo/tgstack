import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    // Integration tests share one database.
    fileParallelism: false,
    globalSetup: ["test/global-setup.ts"],
  },
});
