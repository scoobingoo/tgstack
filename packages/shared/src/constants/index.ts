/**
 * Values the server, admin dashboard and Mini App must agree on. Change them
 * here, never as string literals in an app.
 */

/** Locales of the bot, dashboard and Mini App. To add one, also add `packages/i18n/locales/<code>/`. */
export const SUPPORTED_LOCALES = ["en", "vi"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** httpOnly cookie holding the admin session, set by `POST /api/auth/exchange`. */
export const SESSION_COOKIE = "tgstack_session";

/** Mini App requests send `Authorization: tma <Telegram.WebApp.initData>`. */
export const MINI_APP_AUTH_SCHEME = "tma";

/** Header Telegram sends with every webhook update when a secret token is set (lowercase, as Node exposes it). */
export const TELEGRAM_SECRET_TOKEN_HEADER = "x-telegram-bot-api-secret-token";

/** Route prefixes of the HTTP API, each with its own authentication (docs/architecture.md). */
export const API_ROUTES = {
  /** Magic-link exchange, session, logout. */
  auth: "/api/auth",
  /** Dashboard endpoints: admin session cookie. */
  admin: "/api/admin",
  /** Mini App endpoints: `Authorization: tma <initData>`. */
  app: "/api/app",
} as const;
