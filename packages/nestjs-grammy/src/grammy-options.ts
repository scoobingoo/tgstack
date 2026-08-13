import type { Context } from "grammy";
import { DEFAULT_WEBHOOK_PATH } from "./grammy.constants.js";
import type {
  GrammyMode,
  GrammyModuleOptions,
  GrammyWebhookOptions,
} from "./interfaces/grammy-options.interface.js";

export interface ResolvedWebhookOptions extends GrammyWebhookOptions {
  path: string;
  autoMount: boolean;
  setWebhook: boolean;
}

export interface ResolvedGrammyModuleOptions<C extends Context = Context>
  extends GrammyModuleOptions<C> {
  mode: GrammyMode;
  webhook: ResolvedWebhookOptions;
}

const MODES: readonly GrammyMode[] = ["polling", "webhook", "none"];

/**
 * Applies defaults and validates module options. Throws a descriptive error
 * at bootstrap instead of failing later inside grammY.
 */
export function resolveGrammyOptions<C extends Context>(
  options: GrammyModuleOptions<C>,
): ResolvedGrammyModuleOptions<C> {
  if (!options || typeof options.token !== "string" || options.token.trim() === "") {
    throw new Error("GrammyModule: `token` is required (get one from @BotFather).");
  }

  const mode = options.mode ?? "polling";
  if (!MODES.includes(mode)) {
    throw new Error(
      `GrammyModule: unknown mode "${String(mode)}" (expected ${MODES.join(" | ")}).`,
    );
  }

  const webhook: ResolvedWebhookOptions = {
    ...options.webhook,
    path: normalizePath(options.webhook?.path ?? DEFAULT_WEBHOOK_PATH),
    autoMount: options.webhook?.autoMount ?? true,
    setWebhook: options.webhook?.setWebhook ?? false,
  };

  if (mode === "webhook" && webhook.setWebhook && !webhook.url) {
    throw new Error("GrammyModule: `webhook.url` is required when `webhook.setWebhook` is true.");
  }
  if (webhook.secretToken !== undefined && !/^[A-Za-z0-9_-]{1,256}$/.test(webhook.secretToken)) {
    // Bot API: 1-256 characters, only A-Z, a-z, 0-9, _ and - are allowed.
    throw new Error(
      "GrammyModule: `webhook.secretToken` must be 1-256 characters of A-Z, a-z, 0-9, _ or -.",
    );
  }

  return { ...options, mode, webhook };
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
