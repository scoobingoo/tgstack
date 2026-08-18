import { describe, expect, it } from "vitest";
import { bigIntReplacer, serializeBigInt, stringifyJson } from "../src/serialization.js";

describe("BigInt serialization", () => {
  const user = {
    id: "u1",
    telegramId: 9_007_199_254_740_993n, // 2^53 + 1: not representable as a JS number
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    payments: [{ amount: 10, chargeId: 1n }],
    lastName: null,
  };

  it("turns bigint into strings without losing precision", () => {
    expect(serializeBigInt(user)).toEqual({
      id: "u1",
      telegramId: "9007199254740993",
      createdAt: "2026-01-02T03:04:05.000Z",
      payments: [{ amount: 10, chargeId: "1" }],
      lastName: null,
    });
  });

  it("works as a JSON.stringify replacer", () => {
    expect(JSON.stringify({ id: 42n }, bigIntReplacer)).toBe('{"id":"42"}');
    expect(stringifyJson([1n, 2])).toBe('["1",2]');
  });

  it("plain JSON.stringify would throw", () => {
    expect(() => JSON.stringify({ id: 1n })).toThrow(TypeError);
  });

  it("passes undefined and primitives through", () => {
    expect(serializeBigInt(undefined)).toBeUndefined();
    expect(serializeBigInt(5n)).toBe("5");
    expect(serializeBigInt("x")).toBe("x");
  });
});
