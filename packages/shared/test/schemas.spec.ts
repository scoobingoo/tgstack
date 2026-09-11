import { describe, expect, it } from "vitest";
import {
  broadcastContentSchema,
  createProductSchema,
  listUsersQuerySchema,
  paginationQuerySchema,
} from "../src/index.js";

describe("pagination", () => {
  it("coerces and defaults", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(paginationQuerySchema.parse({ page: "3", limit: "50" })).toEqual({ page: 3, limit: 50 });
    expect(paginationQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("parses query booleans", () => {
    expect(listUsersQuerySchema.parse({ blocked: "false" }).blocked).toBe(false);
    expect(listUsersQuerySchema.parse({ blocked: "true" }).blocked).toBe(true);
  });
});

describe("products", () => {
  it("follows invoice limits", () => {
    expect(
      createProductSchema.safeParse({ title: "x".repeat(33), description: "d", priceStars: 1 })
        .success,
    ).toBe(false);
    expect(
      createProductSchema.parse({ title: " Pro ", description: "d", priceStars: 5 }),
    ).toMatchObject({
      title: "Pro",
      isActive: true,
    });
  });
});

describe("broadcast content", () => {
  it("accepts text with an optional button", () => {
    expect(broadcastContentSchema.safeParse({ text: "<b>Hello</b>" }).success).toBe(true);
    expect(
      broadcastContentSchema.safeParse({
        text: "Hi",
        buttonText: "Open",
        buttonUrl: "https://example.com",
      }).success,
    ).toBe(true);
  });

  it("requires button text and URL together", () => {
    const result = broadcastContentSchema.safeParse({ text: "Hi", buttonText: "Open" });
    expect(result.error?.issues[0]?.path).toEqual(["buttonUrl"]);
  });

  it("applies the caption limit when there is an image", () => {
    const text = "a".repeat(2000);
    expect(broadcastContentSchema.safeParse({ text }).success).toBe(true);
    expect(
      broadcastContentSchema.safeParse({ text, imageUrl: "https://example.com/a.png" }).success,
    ).toBe(false);
    expect(broadcastContentSchema.safeParse({ text: "a".repeat(4097) }).success).toBe(false);
  });
});
