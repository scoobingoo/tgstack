import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { SESSION_COOKIE } from "@tgstack/shared";

/**
 * OpenAPI spec at `/api/docs` (UI) and `/api/docs-json`. Development only.
 * Request and response schemas come straight from the zod schemas in
 * `@tgstack/shared` (Standard JSON Schema), so the spec cannot drift.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("tgstack API")
    .setDescription(
      "Admin API (`/api/admin/*`, session cookie from the bot's /admin magic link) and Mini App API (`/api/app/*`).",
    )
    .setVersion("1.0")
    .addCookieAuth(SESSION_COOKIE)
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document, { jsonDocumentUrl: "api/docs-json" });
}
