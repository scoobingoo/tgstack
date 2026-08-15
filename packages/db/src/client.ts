import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export type PrismaClientOptions = Omit<
  NonNullable<ConstructorParameters<typeof PrismaClient>[0]>,
  "adapter" | "accelerateUrl"
>;

/**
 * Creates a Prisma Client backed by the `pg` driver adapter (required since Prisma 7).
 * Reuse one instance per process: every client owns a connection pool.
 */
export function createPrismaClient(
  databaseUrl: string | undefined = process.env.DATABASE_URL,
  options: PrismaClientOptions = {},
): PrismaClient {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }
  return new PrismaClient({ ...options, adapter: createPrismaAdapter(databaseUrl) });
}

/** The `pg` driver adapter Prisma Client needs since v7 (e.g. for `class X extends PrismaClient`). */
export function createPrismaAdapter(databaseUrl: string): PrismaPg {
  return new PrismaPg({ connectionString: databaseUrl });
}
