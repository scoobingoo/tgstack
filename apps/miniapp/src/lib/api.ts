import {
  appMeSchema,
  invoiceLinkSchema,
  MINI_APP_AUTH_SCHEME,
  productSchema,
  type UpdateAppMeBody,
  updateAppMeSchema,
} from "@tgstack/shared";
import { z } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * In development the Vite server proxies `/api`; production builds call
 * `VITE_API_URL` when set, otherwise the same origin.
 */
const API_BASE = import.meta.env.DEV
  ? ""
  : (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export function createApiClient(getInitData: () => string, fetchImpl: typeof fetch = fetch) {
  async function request<S extends z.ZodType>(
    path: string,
    schema: S,
    init: { method?: string; body?: unknown } = {},
  ): Promise<z.infer<S>> {
    const response = await fetchImpl(`${API_BASE}/api/app${path}`, {
      method: init.method ?? "GET",
      headers: {
        // The server verifies this signature; the user is never taken from the client.
        Authorization: `${MINI_APP_AUTH_SCHEME} ${getInitData()}`,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new ApiError(response.status, body?.message ?? response.statusText);
    }
    return schema.parse(await response.json());
  }

  return {
    me: () => request("/me", appMeSchema),
    updateMe: async (body: UpdateAppMeBody) =>
      request("/me", appMeSchema, { method: "PATCH", body: updateAppMeSchema.parse(body) }),
    // EXAMPLE: shop
    products: () => request("/products", z.array(productSchema)),
    createInvoice: (productId: string) =>
      request(`/products/${productId}/invoice`, invoiceLinkSchema, { method: "POST" }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
