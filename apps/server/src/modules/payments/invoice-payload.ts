import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Invoice payloads are opaque to the user but must not be forgeable: they say who
 * pays for what. Format (≤ 128 bytes, the Bot API limit):
 *
 *     v1.<productId or "-">.<userId>.<nonce>.<signature>
 *
 * The signature is a truncated HMAC-SHA256 of everything before it.
 */
export interface InvoicePayload {
  productId: string | null;
  userId: string;
  nonce: string;
}

const VERSION = "v1";
const SIGNATURE_BYTES = 16;
const MAX_PAYLOAD_BYTES = 128;
const ID = /^[A-Za-z0-9_-]{1,40}$/;

export class InvoicePayloadSigner {
  constructor(private readonly secret: string) {}

  sign(payload: Omit<InvoicePayload, "nonce"> & { nonce?: string }): string {
    const nonce = payload.nonce ?? randomBytes(8).toString("base64url");
    const productId = payload.productId ?? "-";
    if (!ID.test(payload.userId) || (productId !== "-" && !ID.test(productId))) {
      throw new Error("Invoice payload IDs must be 1-40 URL-safe characters");
    }
    const body = [VERSION, productId, payload.userId, nonce].join(".");
    const signed = `${body}.${this.signature(body)}`;
    if (Buffer.byteLength(signed) > MAX_PAYLOAD_BYTES) throw new Error("Invoice payload too long");
    return signed;
  }

  /** Returns the payload when the signature is valid, otherwise `null`. */
  verify(value: string): InvoicePayload | null {
    const parts = value.split(".");
    if (parts.length !== 5 || parts[0] !== VERSION) return null;
    const [, productId, userId, nonce, signature] = parts as [
      string,
      string,
      string,
      string,
      string,
    ];
    const expected = Buffer.from(this.signature(parts.slice(0, 4).join(".")));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    return { productId: productId === "-" ? null : productId, userId, nonce };
  }

  private signature(body: string): string {
    return createHmac("sha256", this.secret)
      .update(`tgstack:invoice:${body}`)
      .digest()
      .subarray(0, SIGNATURE_BYTES)
      .toString("base64url");
  }
}
