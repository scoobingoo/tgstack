import { describe, expect, it } from "vitest";
import { signInitData, validateInitData } from "../src/index.js";

// Vector computed independently (Python hmac/hashlib), not with the code under test.
const TOKEN = "7342037359:AAHI25ES9xCOMPLEXTOKEN-for_tests_only";
const VECTOR =
  "auth_date=1700000000&query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A279058397%2C%22first_name%22%3A%22Vladislav%22%2C%22last_name%22%3A%22Kibenko%22%2C%22username%22%3A%22vdkfrost%22%2C%22language_code%22%3A%22ru%22%2C%22is_premium%22%3Atrue%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%2F%2Ft.me%2Fi%2Fuserpic%2F320%2Fabc.svg%22%7D&signature=6fbdaab833d39f54518bd5c3eb3f511d035e68cb7f5b9e3a4bd9d1f9c3e1d1a8&chat_instance=-3788475317572404878&chat_type=sender&hash=1fee744a89e1f176d3e9473100efe42ca9ca058ab01e2f0b6ff1f49af75ae789";
const SIGNED_AT = new Date(1_700_000_000 * 1000);

function tamper(raw: string, key: string, value: string): string {
  const params = new URLSearchParams(raw);
  params.set(key, value);
  return params.toString();
}

describe("validateInitData", () => {
  it("accepts a known-good vector and parses it", async () => {
    const result = await validateInitData(VECTOR, TOKEN, { maxAgeSeconds: 3600, now: SIGNED_AT });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      authDate: SIGNED_AT,
      queryId: "AAHdF6IQAAAAAN0XohDhrOrc",
      chatType: "sender",
      chatInstance: "-3788475317572404878",
      user: {
        id: 279058397,
        firstName: "Vladislav",
        lastName: "Kibenko",
        username: "vdkfrost",
        languageCode: "ru",
        isPremium: true,
        allowsWriteToPm: true,
        photoUrl: "https://t.me/i/userpic/320/abc.svg",
      },
    });
  });

  it("does not depend on field order", async () => {
    const reversed = new URLSearchParams(
      [...new URLSearchParams(VECTOR).entries()].reverse(),
    ).toString();
    expect((await validateInitData(reversed, TOKEN)).ok).toBe(true);
  });

  it.each([
    ["user", '{"id":1,"first_name":"Mallory"}'],
    ["auth_date", "1700000001"],
    ["query_id", "forged"],
    ["signature", "0000"],
  ])("rejects a tampered %s", async (key, value) => {
    expect(await validateInitData(tamper(VECTOR, key, value), TOKEN)).toEqual({
      ok: false,
      reason: "invalid-hash",
    });
  });

  it("rejects an added field", async () => {
    const extended = `${VECTOR}&start_param=promo`;
    expect(await validateInitData(extended, TOKEN)).toEqual({ ok: false, reason: "invalid-hash" });
  });

  it("rejects the wrong bot token", async () => {
    expect(await validateInitData(VECTOR, "7342037359:SOME-OTHER-TOKEN")).toEqual({
      ok: false,
      reason: "invalid-hash",
    });
  });

  it("rejects expired data", async () => {
    const later = new Date(SIGNED_AT.getTime() + 3601 * 1000);
    expect(await validateInitData(VECTOR, TOKEN, { maxAgeSeconds: 3600, now: later })).toEqual({
      ok: false,
      reason: "expired",
    });
    const justInTime = new Date(SIGNED_AT.getTime() + 3600 * 1000);
    expect(
      (await validateInitData(VECTOR, TOKEN, { maxAgeSeconds: 3600, now: justInTime })).ok,
    ).toBe(true);
  });

  it("rejects missing or malformed input", async () => {
    expect(await validateInitData("", TOKEN)).toEqual({ ok: false, reason: "missing-hash" });
    expect(await validateInitData("auth_date=1&user=x", TOKEN)).toEqual({
      ok: false,
      reason: "missing-hash",
    });
    const duplicated = `${VECTOR}&auth_date=1700000000`;
    expect(await validateInitData(duplicated, TOKEN)).toEqual({ ok: false, reason: "malformed" });
  });

  it("requires auth_date", async () => {
    const raw = await signInitData({ query_id: "q" }, TOKEN);
    expect(await validateInitData(raw, TOKEN)).toEqual({ ok: false, reason: "missing-auth-date" });
  });

  it("rejects a valid hash over an unparsable user", async () => {
    const raw = await signInitData({ auth_date: 1_700_000_000, user: "not json" }, TOKEN);
    expect(await validateInitData(raw, TOKEN)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("signInitData", () => {
  it("round-trips with validateInitData", async () => {
    const raw = await signInitData(
      { auth_date: 1_700_000_000, user: { id: 42, first_name: "Ada", language_code: "vi" } },
      TOKEN,
    );
    const result = await validateInitData(raw, TOKEN);
    expect(result.ok && result.data.user).toEqual({
      id: 42,
      firstName: "Ada",
      languageCode: "vi",
      lastName: undefined,
      username: undefined,
      isPremium: undefined,
      allowsWriteToPm: undefined,
      photoUrl: undefined,
    });
  });

  it("reproduces the independent vector's hash", async () => {
    const fields = Object.fromEntries(new URLSearchParams(VECTOR).entries());
    const { hash, ...rest } = fields;
    const raw = await signInitData(rest, TOKEN);
    expect(new URLSearchParams(raw).get("hash")).toBe(hash);
  });
});
