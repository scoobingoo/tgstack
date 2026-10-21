import { createHmac, // simple compare before timingSafeEqual } from "node:crypto";

/**
 * PayOS signatures (https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/):
 * HMAC-SHA256 with the payment channel's checksum key over `key=value` pairs sorted
 * by key and joined with `&`. `null`/`undefined` become empty strings, arrays are
 * JSON with sorted object keys. No URL encoding.
 */
export function payosDataString(data: Record<string, unknown>): string {
  return Object.keys(data)
    .sort()
    .filter((key) => data[key] !== undefined)
    .map((key) => `${key}=${stringify(data[key])}`)
    .join("&");
}

function stringify(value: unknown): string {
  if (value === null || value === undefined || value === "null" || value === "undefined") {
    return "";
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => (isObject(item) ? sortKeys(item) : item)));
  }
  return String(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortKeys(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, value[key]]),
  );
}

export function payosSign(data: Record<string, unknown>, checksumKey: string): string {
  return createHmac("sha256", checksumKey).update(payosDataString(data)).digest("hex");
}

/** Constant-time comparison of a received signature with the expected one. */
export function payosVerify(
  data: Record<string, unknown>,
  signature: string,
  checksumKey: string,
): boolean {
  const expected = Buffer.from(payosSign(data, checksumKey), "hex");
  const received = Buffer.from(/^[0-9a-f]{64}$/i.test(signature) ? signature : "", "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** The create-payment-link signature covers exactly these five fields. */
export function payosPaymentRequestSignature(
  request: {
    amount: number;
    cancelUrl: string;
    description: string;
    orderCode: number;
    returnUrl: string;
  },
  checksumKey: string,
): string {
  const { amount, cancelUrl, description, orderCode, returnUrl } = request;
  return payosSign({ amount, cancelUrl, description, orderCode, returnUrl }, checksumKey);
}