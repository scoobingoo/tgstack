import {
  audienceSchema,
  type BroadcastContentBody,
  type BroadcastSegment,
  broadcastProgressSchema,
  broadcastSchema,
  type CreateProductBody,
  type ListBroadcastsQuery,
  type ListPaymentsQuery,
  type ListProductsQuery,
  type ListUsersQuery,
  paginatedSchema,
  paymentSchema,
  productSchema,
  type Role,
  sessionSchema,
  statsSchema,
  type UpdateProductBody,
  userDetailSchema,
  userSchema,
} from "@tgstack/shared";
import type { z } from "zod";

/** An error response from the API (`{ statusCode, message, issues? }`). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions<S extends z.ZodType> {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  /** Validates the response; the return type follows the schema. */
  schema?: S;
}

function queryString(query: Query | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

/**
 * Calls the tgstack server through the same origin (`/api/*`), so the httpOnly
 * session cookie is sent automatically. A `401` sends the browser to /login.
 */
async function request<S extends z.ZodType = z.ZodUnknown>(
  path: string,
  options: RequestOptions<S> = {},
): Promise<z.infer<S>> {
  const response = await fetch(`/api${path}${queryString(options.query)}`, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: options.body === undefined ? undefined : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (
    response.status === 401 &&
    !path.startsWith("/auth/exchange") &&
    typeof window !== "undefined"
  ) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/login?expired=1&next=${next}`);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      issues?: { path: string; message: string }[];
    } | null;
    throw new ApiError(response.status, body?.message ?? response.statusText, body?.issues);
  }
  if (response.status === 204) return undefined as z.infer<S>;
  const json: unknown = await response.json();
  return (options.schema ? options.schema.parse(json) : json) as z.infer<S>;
}

const usersPage = paginatedSchema(userSchema);
const productsPage = paginatedSchema(productSchema);
const paymentsPage = paginatedSchema(paymentSchema);
const broadcastsPage = paginatedSchema(broadcastSchema);

/** Typed client for every endpoint the dashboard uses. Responses are validated with the shared zod schemas. */
export const api = {
  auth: {
    exchange: (token: string) =>
      request("/auth/exchange", { method: "POST", body: { token }, schema: sessionSchema }),
    me: () => request("/auth/me", { schema: sessionSchema }),
    logout: () => request("/auth/logout", { method: "POST" }),
  },
  stats: () => request("/admin/stats", { schema: statsSchema }),
  users: {
    list: (query: Partial<ListUsersQuery>) => request("/admin/users", { query, schema: usersPage }),
    get: (id: string) => request(`/admin/users/${id}`, { schema: userDetailSchema }),
    setRole: (id: string, role: Role) =>
      request(`/admin/users/${id}`, { method: "PATCH", body: { role }, schema: userSchema }),
  },
  broadcasts: {
    list: (query: Partial<ListBroadcastsQuery>) =>
      request("/admin/broadcasts", { query, schema: broadcastsPage }),
    get: (id: string) => request(`/admin/broadcasts/${id}`, { schema: broadcastSchema }),
    create: (body: BroadcastContentBody) =>
      request("/admin/broadcasts", { method: "POST", body, schema: broadcastSchema }),
    update: (id: string, body: BroadcastContentBody) =>
      request(`/admin/broadcasts/${id}`, { method: "PATCH", body, schema: broadcastSchema }),
    preview: (id: string) => request(`/admin/broadcasts/${id}/preview`, { method: "POST" }),
    start: (id: string) =>
      request(`/admin/broadcasts/${id}/start`, { method: "POST", schema: broadcastProgressSchema }),
    cancel: (id: string) =>
      request(`/admin/broadcasts/${id}/cancel`, {
        method: "POST",
        schema: broadcastProgressSchema,
      }),
    schedule: (id: string, scheduledAt: string) =>
      request(`/admin/broadcasts/${id}/schedule`, {
        method: "POST",
        body: { scheduledAt },
        schema: broadcastProgressSchema,
      }),
    unschedule: (id: string) =>
      request(`/admin/broadcasts/${id}/unschedule`, {
        method: "POST",
        schema: broadcastProgressSchema,
      }),
    audience: (segment: BroadcastSegment | null) =>
      request("/admin/broadcasts/audience", {
        method: "POST",
        body: { segment },
        schema: audienceSchema,
      }),
    progress: (id: string) =>
      request(`/admin/broadcasts/${id}`, { schema: broadcastProgressSchema }),
    eventsUrl: (id: string) => `/api/admin/broadcasts/${id}/events`,
  },
  // EXAMPLE: shop
  products: {
    list: (query: Partial<ListProductsQuery>) =>
      request("/admin/products", { query, schema: productsPage }),
    create: (body: CreateProductBody) =>
      request("/admin/products", { method: "POST", body, schema: productSchema }),
    update: (id: string, body: UpdateProductBody) =>
      request(`/admin/products/${id}`, { method: "PATCH", body, schema: productSchema }),
    deactivate: (id: string) =>
      request(`/admin/products/${id}`, { method: "DELETE", schema: productSchema }),
  },
  payments: {
    list: (query: Partial<ListPaymentsQuery>) =>
      request("/admin/payments", { query, schema: paymentsPage }),
    refund: (id: string) =>
      request(`/admin/payments/${id}/refund`, { method: "POST", schema: paymentSchema }),
  },
};
