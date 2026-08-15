import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer loads .env files. Load the monorepo root .env (decision D11),
// plus an optional package-local one loaded first so it wins; shell variables win over both.
for (const file of [".env", "../../.env"]) {
  const path = fileURLToPath(new URL(file, import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/seed.ts",
  },
  datasource: {
    // `prisma generate` does not need a database; commands that do fail with a clear message.
    url: process.env.DATABASE_URL ?? "",
  },
});
