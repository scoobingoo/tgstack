import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "../src/lib/api";

const me = {
  id: "u1",
  telegramId: "42",
  firstName: "Ada",
  lastName: null,
  username: "ada",
  locale: "en",
  onboarding: null,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Mini App API client", () => {
  it("authenticates every request with the raw initData", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(me));
    const api = createApiClient(() => "auth_date=1&hash=abc", fetchMock as unknown as typeof fetch);

    await expect(api.me()).resolves.toEqual(me);
    expect(fetchMock).toHaveBeenCalledWith("/api/app/me", {
      method: "GET",
      headers: { Authorization: "tma auth_date=1&hash=abc" },
      body: undefined,
    });
  });

  it("sends JSON bodies and validates them first", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ ...me, locale: "vi" }),
    );
    const api = createApiClient(() => "raw", fetchMock as unknown as typeof fetch);
    await api.updateMe({ locale: "vi" });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PATCH",
      body: '{"locale":"vi"}',
      headers: { "content-type": "application/json" },
    });
    // @ts-expect-error unsupported locales never reach the network
    await expect(api.updateMe({ locale: "fr" })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("turns error responses into ApiError", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ message: "Invalid init data (expired)" }, 401),
    );
    const api = createApiClient(() => "raw", fetchMock as unknown as typeof fetch);
    const error = await api.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, message: "Invalid init data (expired)" });
  });

  it("rejects responses that do not match the shared schema", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ id: 1 }));
    const api = createApiClient(() => "raw", fetchMock as unknown as typeof fetch);
    await expect(api.me()).rejects.toThrow();
  });
});
