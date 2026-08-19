import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prepareTestDatabase } from "../src/testing.js";

export default async function setup(): Promise<void> {
  const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  await prepareTestDatabase("db");
}
