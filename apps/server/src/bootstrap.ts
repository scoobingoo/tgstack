import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { bigIntReplacer } from "@tgstack/db";
import { Logger } from "nestjs-pino";
import { AppConfig } from "./config/app-config.js";
import { EnvValidationError } from "./config/env.js";

/**
 * HTTP setup shared by `main.ts` and the e2e tests, so tests exercise the same
 * prefixes, serialisation and CORS rules as production.
 */
export function configureApp(app: NestExpressApplication): INestApplication {
  const config = app.get(AppConfig);
  app.useLogger(app.get(Logger));
  // Decision D6: Telegram IDs are BigInt in the DB and strings in JSON.
  app.set("json replacer", bigIntReplacer);
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.setGlobalPrefix("api", { exclude: ["health"] });
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.enableShutdownHooks();
  return app;
}

/** Prints configuration problems readably instead of a stack trace, then exits. */
export function exitOnBootstrapError(error: unknown): never {
  if (error instanceof EnvValidationError) {
    console.error(`\n${error.message}\n\nFix them in .env (see .env.example) and restart.\n`);
  } else {
    console.error("Failed to start:", error);
  }
  process.exit(1);
}
