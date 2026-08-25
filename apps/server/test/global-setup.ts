import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prepareTestDatabase } from "@tgstack/db/testing";

/** Loads the root .env (TEST_* URLs) and prepares this package's own test database. */
export default async function setup(): Promise<void> {
  const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  await prepareTestDatabase("server");
}
