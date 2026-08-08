import { type RunnerHandle, run } from "@grammyjs/runner";
import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleInit,
  Optional,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { type Bot, type Context, webhookCallback } from "grammy";
import type { Update } from "grammy/types";
import { GRAMMY_BOT, GRAMMY_MODULE_OPTIONS } from "../grammy.constants.js";
import type { ResolvedGrammyModuleOptions } from "../grammy-options.js";
import { GrammyExplorer } from "./grammy-explorer.service.js";

/** Express-style `(req, res)` handler. */
// biome-ignore lint/suspicious/noExplicitAny: framework-agnostic; works with Express and compatible adapters.
export type WebhookRequestHandler = (req: any, res: any) => Promise<void>;

/**
 * Starts and stops the bot:
 * - `onModuleInit`: mounts the webhook route (webhook mode), before Nest adds its 404 handler.
 * - `onApplicationBootstrap`: registers handlers, then starts polling or calls `setWebhook`.
 * - `beforeApplicationShutdown`: stops polling and waits for running middleware.
 */
@Injectable()
export class GrammyLifecycle
  implements OnModuleInit, OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger("GrammyModule");
  private runner: RunnerHandle | undefined;

  constructor(
    @Inject(GRAMMY_MODULE_OPTIONS) private readonly options: ResolvedGrammyModuleOptions,
    @Inject(GRAMMY_BOT) private readonly bot: Bot<Context>,
    private readonly explorer: GrammyExplorer,
    @Optional() private readonly httpAdapterHost?: HttpAdapterHost,
  ) {}

  onModuleInit(): void {
    const { mode, webhook } = this.options;
    if (mode !== "webhook" || !webhook.autoMount) return;

    const httpAdapter = this.httpAdapterHost?.httpAdapter;
    if (!httpAdapter) {
      throw new Error(
        "GrammyModule: webhook mode needs an HTTP application (NestFactory.create). " +
          "Set `webhook.autoMount: false` and mount `createWebhookCallback()` yourself.",
      );
    }
    httpAdapter.post(webhook.path, this.createWebhookCallback());
    this.logger.log(`Webhook handler mounted on POST ${webhook.path}`);
  }

  async onApplicationBootstrap(): Promise<void> {
    this.explorer.explore();

    switch (this.options.mode) {
      case "polling":
        await this.startPolling();
        break;
      case "webhook":
        await this.bot.init();
        if (this.options.webhook.setWebhook) await this.setWebhook();
        break;
      case "none":
        break;
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    if (this.runner?.isRunning()) {
      this.logger.log("Stopping long polling");
      this.runner.stop();
    }
    this.runner = undefined;
  }

  /** `true` while long polling is active. */
  isPolling(): boolean {
    return this.runner?.isRunning() ?? false;
  }

  /**
   * An Express-compatible request handler that feeds webhook updates to the bot.
   * Requests without the configured secret token are rejected with `401`.
   */
  createWebhookCallback(): WebhookRequestHandler {
    const { secretToken, timeoutMilliseconds } = this.options.webhook;
    return webhookCallback(this.bot, "express", {
      ...(secretToken === undefined ? {} : { secretToken }),
      ...(timeoutMilliseconds === undefined ? {} : { timeoutMilliseconds }),
    }) as WebhookRequestHandler;
  }

  private async startPolling(): Promise<void> {
    const polling = this.options.polling ?? {};
    await this.bot.init();
    // getUpdates fails with 409 Conflict while a webhook is set, so always clear it first.
    await this.bot.api.deleteWebhook({ drop_pending_updates: polling.dropPendingUpdates ?? false });

    const runOptions = polling.runner ?? {};
    const fetch = {
      ...runOptions.runner?.fetch,
      ...(polling.allowedUpdates ? { allowed_updates: polling.allowedUpdates } : {}),
    };
    this.runner = run<Update, unknown>(this.bot as never, {
      ...runOptions,
      runner: { ...runOptions.runner, fetch },
    });
    this.logger.log(`Long polling started as @${this.bot.botInfo.username}`);
  }

  private async setWebhook(): Promise<void> {
    const { url, secretToken, allowedUpdates, dropPendingUpdates } = this.options.webhook;
    if (!url) return;
    await this.bot.api.setWebhook(url, {
      ...(secretToken ? { secret_token: secretToken } : {}),
      ...(allowedUpdates ? { allowed_updates: allowedUpdates } : {}),
      ...(dropPendingUpdates === undefined ? {} : { drop_pending_updates: dropPendingUpdates }),
    });
    this.logger.log(`Webhook set to ${url}`);
  }
}