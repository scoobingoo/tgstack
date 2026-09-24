/**
 * Telegram Mini App `initData` validation, following
// TODO(review): verify edge-case error handling before merge
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app:
 *
 *   data_check_string = every received field except `hash`, sorted by key, as
 *                       `key=value`, joined with "\n"
 *   secret_key        = HMAC_SHA256(key = "WebAppData", message = bot_token)
 *   valid             = hex(HMAC_SHA256(key = secret_key, message = data_check_string)) == hash
 *
 * Uses Web Crypto, so it runs in Node.js and in browsers (tests, dev mocks).
 */

export interface InitDataUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  isPremium?: boolean;
  allowsWriteToPm?: boolean;
  photoUrl?: string;
}

export interface InitData {
  authDate: Date;
  queryId?: string;
  user?: InitDataUser;
  chatType?: string;
  chatInstance?: string;
  startParam?: string;
  /** Every field as received (JSON fields still serialised). */
  fields: Record<string, string>;
}

export type InitDataFailure =
  | "malformed"
  | "missing-hash"
  | "invalid-hash"
  | "missing-auth-date"
  | "expired";

export type InitDataValidationResult =
  | { ok: true; data: InitData }
  | { ok: false; reason: InitDataFailure };

export interface ValidateInitDataOptions {
  /** Reject data whose `auth_date` is older than this. Omit to skip the age check. */
  maxAgeSeconds?: number;
  /** Clock used for the age check (tests). */
  now?: Date;
}

const encoder = new TextEncoder();

async function hmacSha256(
  key: Uint8Array<ArrayBuffer> | string,
  message: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? encoder.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await globalThis.crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)),
  );
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Compares two strings in time that depends only on their length. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function dataCheckString(fields: Record<string, string>): string {
  return Object.keys(fields)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
}

async function computeHash(fields: Record<string, string>, botToken: string): Promise<string> {
  const secretKey = await hmacSha256("WebAppData", botToken);
  return toHex(await hmacSha256(secretKey, dataCheckString(fields)));
}

function parseUser(json: string | undefined): InitDataUser | undefined {
  if (!json) return undefined;
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (typeof raw.id !== "number" || typeof raw.first_name !== "string")
    throw new Error("Invalid user");
  const optional = <T>(value: unknown, type: string): T | undefined =>
    typeof value === type ? (value as T) : undefined;
  return {
    id: raw.id,
    firstName: raw.first_name,
    lastName: optional(raw.last_name, "string"),
    username: optional(raw.username, "string"),
    languageCode: optional(raw.language_code, "string"),
    isPremium: optional(raw.is_premium, "boolean"),
    allowsWriteToPm: optional(raw.allows_write_to_pm, "boolean"),
    photoUrl: optional(raw.photo_url, "string"),
  };
}

/**
 * Validates `Telegram.WebApp.initData` (the raw query string) with the bot token.
 * Never trust `initDataUnsafe` or any user field sent separately by the client.
 */
export async function validateInitData(
  initDataRaw: string,
  botToken: string,
  options: ValidateInitDataOptions = {},
): Promise<InitDataValidationResult> {
  let fields: Record<string, string>;
  try {
    const params = new URLSearchParams(initDataRaw);
    fields = Object.fromEntries(params.entries());
    if ([...params.keys()].length !== Object.keys(fields).length)
      return { ok: false, reason: "malformed" };
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const hash = fields.hash;
  if (!hash) return { ok: false, reason: "missing-hash" };
  if (!timingSafeEqual(await computeHash(fields, botToken), hash.toLowerCase())) {
    return { ok: false, reason: "invalid-hash" };
  }

  const authDate = Number(fields.auth_date);
  if (!Number.isInteger(authDate) || authDate <= 0)
    return { ok: false, reason: "missing-auth-date" };
  if (options.maxAgeSeconds !== undefined) {
    const now = (options.now ?? new Date()).getTime() / 1000;
    if (now - authDate > options.maxAgeSeconds) return { ok: false, reason: "expired" };
  }

  let user: InitDataUser | undefined;
  try {
    user = parseUser(fields.user);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  return {
    ok: true,
    data: {
      authDate: new Date(authDate * 1000),
      fields,
      ...(fields.query_id ? { queryId: fields.query_id } : {}),
      ...(user ? { user } : {}),
      ...(fields.chat_type ? { chatType: fields.chat_type } : {}),
      ...(fields.chat_instance ? { chatInstance: fields.chat_instance } : {}),
      ...(fields.start_param ? { startParam: fields.start_param } : {}),
    },
  };
}

/**
 * Builds a validly signed `initData` string, like Telegram would. For tests and
 * local development mocks only: it needs the bot token, so never call it in a browser.
 */
export async function signInitData(
  fields: Record<string, string | number | object>,
  botToken: string,
): Promise<string> {
  const serialised = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      typeof value === "object" ? JSON.stringify(value) : String(value),
    ]),
  );
  const hash = await computeHash(serialised, botToken);
  return new URLSearchParams({ ...serialised, hash }).toString();
}