import type { Transformer } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";

export interface RecordedApiCall {
  method: string;
  payload: Record<string, any>;
  /** `Date.now()` when the call was made. */
  at: number;
}

interface AbortSignalLike {
  addEventListener(type: "abort", listener: () => void): void;
}

export interface ApiErrorFixture {
  error_code: number;
  description: string;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
}

/** Return a value to answer the call, or an {@link ApiError} instance to fail it. */
export type ApiResultFactory = (
  payload: Record<string, any>,
  call: RecordedApiCall,
) => unknown | Promise<unknown>;

/** Wraps a Bot API error response; return it from a result factory to make the call fail. */
export class ApiError {
  constructor(readonly fixture: ApiErrorFixture) {}
}

export function createBotInfo(overrides: Partial<UserFromGetMe> = {}): UserFromGetMe {
  return {
    id: 4242,
    is_bot: true,
    first_name: "Test Bot",
    username: "test_bot",
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: true,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
    can_manage_bots: false,
    supports_join_request_queries: false,
    ...overrides,
  };
}

/**
 * An in-memory Bot API. Install its {@link MockBotApi.transformer} on a bot
 * (`bot.api.config.use()` or the module's `transformers` option) and no request
 * ever leaves the process. Every call is recorded in {@link MockBotApi.calls}.
 */
export class MockBotApi {
  readonly calls: RecordedApiCall[] = [];
  private readonly factories = new Map<string, ApiResultFactory>();
  private readonly queue: Update[] = [];
  private nextMessageId = 1;

  constructor(readonly botInfo: UserFromGetMe = createBotInfo()) {}

  /** grammY API transformer that answers every call from this mock. */
  readonly transformer: Transformer = async (_prev, method, payload, signal) => {
    const call: RecordedApiCall = {
      method,
      payload: (payload ?? {}) as Record<string, any>,
      at: Date.now(),
    };
    if (method !== "getUpdates") this.calls.push(call);

    const factory = this.factories.get(method);
    const result = factory
      ? await factory(call.payload, call)
      : await this.defaultResult(method, call.payload, signal as AbortSignalLike | undefined);

    if (result instanceof ApiError) {
      return { ok: false, ...result.fixture } as never;
    }
    return { ok: true, result } as never;
  };

  /** Overrides the response of a method. */
  on(method: string, factory: ApiResultFactory): this {
    this.factories.set(method, factory);
    return this;
  }

  /** Makes every call of `method` fail with the given Bot API error. */
  fail(method: string, error: ApiErrorFixture): this {
    return this.on(method, () => new ApiError(error));
  }

  /** Queues an update for the next `getUpdates` call (long polling). */
  pushUpdate(update: Update): void {
    this.queue.push(update);
  }

  callsTo(method: string): RecordedApiCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  reset(): void {
    this.calls.length = 0;
    this.factories.clear();
    this.queue.length = 0;
  }

  private async defaultResult(
    method: string,
    payload: Record<string, any>,
    signal: AbortSignalLike | undefined,
  ): Promise<unknown> {
    switch (method) {
      case "getMe":
        return this.botInfo;
      case "getUpdates":
        return this.takeUpdates(signal);
      case "sendMessage":
      case "sendPhoto":
      case "sendInvoice":
      case "editMessageText":
        return this.message(payload);
      case "createInvoiceLink":
        return "https://t.me/$test-invoice";
      default:
        return true;
    }
  }

  private message(payload: Record<string, any>): unknown {
    return {
      message_id: this.nextMessageId++,
      date: Math.floor(Date.now() / 1000),
      chat: { id: Number(payload.chat_id ?? 0), type: "private", first_name: "Test" },
      from: this.botInfo,
      ...(typeof payload.text === "string" ? { text: payload.text } : {}),
      ...(typeof payload.caption === "string" ? { caption: payload.caption } : {}),
    };
  }

  private async takeUpdates(signal: AbortSignalLike | undefined): Promise<Update[]> {
    if (this.queue.length === 0) {
      // Behave like a (very short) long poll instead of spinning.
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 20);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    return this.queue.splice(0, this.queue.length);
  }
}
