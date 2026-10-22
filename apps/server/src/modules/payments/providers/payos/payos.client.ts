import { payosPaymentRequestSignature } from "./payos.signature.js";

export interface PayOsCredentials {
  clientId: string;
  apiKey: string;
  checksumKey: string;
  /** `https://api-merchant.payos.vn` (PayOS has no sandbox; tests point it at a local mock). */
  baseUrl: string;
}

export interface CreatePaymentLinkRequest {
  orderCode: number;
  /** Whole đồng. */
  amount: number;
  /** At most 9 characters for bank accounts not linked through PayOS. */
  description: string;
  returnUrl: string;
  cancelUrl: string;
  /** Unix seconds. */
  expiredAt: number;
  items?: { name: string; quantity: number; price: number }[];
}

export interface PaymentLink {
  paymentLinkId: string;
  checkoutUrl: string;
  /** VietQR payload (EMVCo string). */
  qrCode: string;
  status: string;
}

/** A PayOS API answer that is not `code: "00"`, or an HTTP error. */
export class PayOsError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "PayOsError";
  }
}

interface Envelope<T> {
  code: string;
  desc: string;
  data: T | null;
}

/** Minimal client for the PayOS merchant API (https://payos.vn/docs/api/). */
export class PayOsClient {
  constructor(private readonly credentials: PayOsCredentials) {}

  get checksumKey(): string {
    return this.credentials.checksumKey;
  }

  async createPaymentLink(request: CreatePaymentLinkRequest): Promise<PaymentLink> {
    const signature = payosPaymentRequestSignature(request, this.credentials.checksumKey);
    return this.request<PaymentLink>("POST", "/v2/payment-requests", { ...request, signature });
  }

  async cancelPaymentLink(orderCode: number, reason: string): Promise<void> {
    await this.request("POST", `/v2/payment-requests/${orderCode}/cancel`, {
      cancellationReason: reason,
    });
  }

  /** Registers the webhook URL; PayOS immediately sends a signed test payload to it. */
  async confirmWebhook(webhookUrl: string): Promise<void> {
    await this.request("POST", "/confirm-webhook", { webhookUrl });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(new URL(path, this.credentials.baseUrl), {
      method,
      headers: {
        "content-type": "application/json",
        "x-client-id": this.credentials.clientId,
        "x-api-key": this.credentials.apiKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const envelope = (await response.json().catch(() => null)) as Envelope<T> | null;
    if (!response.ok || !envelope || envelope.code !== "00" || envelope.data === null) {
      throw new PayOsError(
        envelope?.desc ?? `HTTP ${response.status}`,
        envelope?.code,
        response.status,
      );
    }
    return envelope.data;
  }
}
