import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { PrismaClient } from "./generated/prisma/client.js";

const packageDir = fileURLToPath(new URL("..", import.meta.url));

/**
 * Applies all migrations to the given database with `prisma migrate deploy`.
 * Used by integration-test global setups across the monorepo.
 */
export function migrateDatabase(databaseUrl: string): void {
  const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: packageDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

/** Deletes every row of every table. Call it in `beforeEach` of integration tests. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Payment", "PaymentOrder", "Broadcast", "Product", "User" RESTART IDENTITY CASCADE',
  );
}

/** Reads `TEST_DATABASE_URL`, failing with a helpful message when it is missing. */
export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Start the infrastructure with `pnpm infra:up` and copy .env.example to .env.",
    );
  }
  return url;
}

/**
 * Gives each test suite its own database (`<TEST_DATABASE_URL db>_<suffix>`) so
 * packages can run their integration tests in parallel. Creates it when missing,
 * applies migrations, and points `TEST_DATABASE_URL` at it for the test workers.
 */
export async function prepareTestDatabase(suffix: string): Promise<string> {
  const baseUrl = new URL(getTestDatabaseUrl());
  const name = `${baseUrl.pathname.slice(1)}_${suffix}`.replace(/[^\w]/g, "_");
  const client = new pg.Client({ connectionString: baseUrl.toString() });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  migrateDatabase(url.toString());
  process.env.TEST_DATABASE_URL = url.toString();
  return url.toString();
}
