import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "./helpers/app.js";
import { createTestEnv } from "./helpers/env.js";

describe("GET /health", () => {
  it("reports database and redis as up", async () => {
    const app = await createTestApp();
    const response = await request(app.getHttpServer()).get("/health").expect(200);
    expect(response.body).toMatchObject({
      status: "ok",
      info: { database: { status: "up" }, redis: { status: "up" } },
    });
    await app.close();
  });

  it("answers 503 when Redis is unreachable", async () => {
    const app = await createTestApp({ env: createTestEnv({ REDIS_URL: "redis://127.0.0.1:1" }) });
    const response = await request(app.getHttpServer()).get("/health").expect(503);
    expect(response.body.details.redis.status).toBe("down");
    expect(response.body.details.database.status).toBe("up");
    await app.close();
  });

  it("is served outside the /api prefix, unknown routes are JSON 404s", async () => {
    const app = await createTestApp();
    const response = await request(app.getHttpServer()).get("/api/nope").expect(404);
    expect(response.body).toMatchObject({ statusCode: 404, error: "Not Found" });
    await app.close();
  });
});
