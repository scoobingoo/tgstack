# @tgstack/nestjs-grammy

NestJS module for [grammY](https://grammy.dev): build Telegram bots with decorators, dependency injection, guards, interceptors, pipes and exception filters.

- `GrammyModule.forRoot()` / `forRootAsync()` — the `Bot` is a regular provider (`@InjectBot()`).
- `@Update()` classes with `@Start()`, `@Command()`, `@Hears()`, `@On()`, `@CallbackQuery()`, `@InlineQuery()`.
- `@Ctx()`, `@Message()`, `@Sender()`, `@Next()` parameter decorators, with pipes.
- Standard `@UseGuards()`, `@UseInterceptors()`, `@UseFilters()` on bot handlers.
- Long polling through [`@grammyjs/runner`](https://grammy.dev/plugins/runner) or webhooks with secret-token verification.
- An in-memory Bot API for tests (`@tgstack/nestjs-grammy/testing`).

Requirements: Node.js ≥ 20, NestJS 12 (ESM), grammY 1.x. Every sample below is type-checked in [`examples/readme.examples.ts`](./examples/readme.examples.ts).

## Install

```bash
pnpm add @tgstack/nestjs-grammy grammy
```

`@nestjs/common`, `@nestjs/core`, `reflect-metadata` and `rxjs` are peer dependencies that a Nest app already has.

## Quick start

```ts
import { Module } from "@nestjs/common";
import { Command, Ctx, GrammyModule, Hears, Sender, Start, Update } from "@tgstack/nestjs-grammy";
import type { Context } from "grammy";

@Update()
export class GreetingUpdate {
  @Start()
  async start(@Ctx() ctx: Context) {
    await ctx.reply("Welcome! Send /help to see what I can do.");
  }

  @Command("help")
  help() {
    return "Commands: /start, /help"; // returning a string replies with it
  }

  @Hears(/^hi$/i)
  hi(@Sender("first_name") name: string) {
    return `Hi, ${name}!`;
  }
}

@Module({
  imports: [GrammyModule.forRoot({ token: process.env.BOT_TOKEN ?? "" })],
  providers: [GreetingUpdate],
})
export class AppModule {}
```

Call `app.enableShutdownHooks()` in `main.ts` so polling stops cleanly on `SIGTERM`.

## Configuration

```ts
GrammyModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    token: config.getOrThrow<string>("BOT_TOKEN"),
    mode: config.get("BOT_MODE") === "webhook" ? "webhook" : "polling",
    webhook: {
      path: "/telegram/webhook",
      secretToken: config.get<string>("BOT_WEBHOOK_SECRET"),
      url: `${config.get<string>("PUBLIC_URL")}/telegram/webhook`,
      setWebhook: true,
    },
    transformers: [autoRetry()],
    middlewares: [sequentialize((ctx: Context) => ctx.chat?.id.toString())],
  }),
});
```

`forRootAsync` also accepts `useClass` / `useExisting` with a class implementing `GrammyOptionsFactory`. The module is global.

| Option | Default | Description |
|---|---|---|
| `token` | — | Bot token from @BotFather (required). |
| `mode` | `"polling"` | `"polling"`, `"webhook"`, or `"none"` (send-only, e.g. a queue worker). |
| `botConfig` | — | Passed to `new Bot(token, botConfig)`: `botInfo`, `client`, `ContextConstructor`. |
| `transformers` | `[]` | API transformers, installed with `bot.api.config.use()` in order (the last one wraps the others). |
| `middlewares` | `[]` | Global middleware and plugins (`session`, `conversations`, …), installed before any handler. |
| `catch` | log via Nest `Logger` | Error handler for every mode — see [Error handling](#error-handling). |
| `polling.allowedUpdates` | Telegram default | `allowed_updates` for `getUpdates`. |
| `polling.dropPendingUpdates` | `false` | Drop updates received while the bot was offline. |
| `polling.runner` | — | Options for `@grammyjs/runner`'s `run()`. |
| `webhook.path` | `/telegram/webhook` | Route mounted on the Nest HTTP adapter (outside any global prefix). |
| `webhook.secretToken` | — | Expected `X-Telegram-Bot-Api-Secret-Token`; other requests get `401`. |
| `webhook.setWebhook` / `url` | `false` | Call `setWebhook(url, { secret_token, allowed_updates })` on bootstrap. |
| `webhook.autoMount` | `true` | Set `false` to mount `GrammyLifecycle#createWebhookCallback()` yourself. |
| `include` | all modules | Only discover `@Update()` classes in these modules. |

## Decorators

| Decorator | grammY equivalent |
|---|---|
| `@Update()` | marks a provider that contains handlers |
| `@Start()` | `bot.command("start")` |
| `@Command("help")`, `@Command(["help", "about"])` | `bot.command(...)` |
| `@Hears("hi")`, `@Hears(/^hi$/i)` | `bot.hears(...)` |
| `@On("message:photo")` | `bot.on(...)` (any [filter query](https://grammy.dev/guide/filter-queries)) |
| `@CallbackQuery("buy")`, `@CallbackQuery(/^buy:(.+)$/)` | `bot.callbackQuery(...)` |
| `@InlineQuery()`, `@InlineQuery(/^gif /)` | `bot.on("inline_query")` / `bot.inlineQuery(...)` |

| Parameter | Value |
|---|---|
| `@Ctx()` | the grammY `Context` |
| `@Message()`, `@Message("text")` | `ctx.msg` or one of its properties |
| `@Sender()`, `@Sender("id")` | `ctx.from` or one of its properties |
| `@Next()` | `next()` — call it to pass the update on to later handlers |

Parameter decorators accept pipes: `@Message("text", new TrimPipe()) text: string`.

```ts
@Update()
export class MenuUpdate {
  @Command("menu")
  async menu(@Ctx() ctx: Context) {
    const keyboard = new InlineKeyboard().text("Coffee", "order:coffee").text("Tea", "order:tea");
    await ctx.reply("What would you like?", { reply_markup: keyboard });
  }

  @CallbackQuery(/^order:(.+)$/)
  async order(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`One ${ctx.match[1]} coming up!`);
  }

  @On("message:photo")
  photo(@Message("caption") caption: string | undefined, @Sender() from: User) {
    return `Nice photo, ${from.first_name}${caption ? `: ${caption}` : ""}`;
  }
}
```

**Order.** Handlers register on bootstrap, after the global `middlewares`: `@Update()` classes in module discovery order, then methods in declaration order, then stacked decorators top to bottom. As in grammY, the first matching handler wins unless it calls `next()`. `@Update()` classes must be singletons (no request scope).

## Injecting the bot

```ts
@Injectable()
export class NotificationService {
  constructor(@InjectBot() private readonly bot: Bot<Context>) {}

  notify(chatId: number, text: string) {
    return this.bot.api.sendMessage(chatId, text);
  }
}
```

## Guards, interceptors and filters

Handlers run through Nest's execution context with type `"grammy"`. `TelegramExecutionContext` gives typed access to the grammY context:

```ts
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const ctx = TelegramExecutionContext.create(context).getContext();
    return ctx.from !== undefined && ADMIN_IDS.has(ctx.from.id);
  }
}

@Catch(ForbiddenException)
export class ForbiddenReplyFilter implements ExceptionFilter {
  catch(_exception: ForbiddenException, host: ArgumentsHost) {
    const ctx = TelegramExecutionContext.create(host).getContext();
    // Return a value (here: the reply promise) to mark the exception as handled.
    return ctx.reply("This command is for admins only.");
  }
}

@Update()
@UseFilters(ForbiddenReplyFilter)
export class AdminUpdate {
  @Command("stats")
  @UseGuards(AdminGuard)
  stats() {
    return "42 users";
  }
}
```

- A guard that returns `false` throws `ForbiddenException` (standard Nest behaviour); catch it with a filter to reply.
- An exception filter must **return a value** (for example the `ctx.reply()` promise). Since NestJS 12, a filter that returns `undefined` is treated as "not handled" and the error continues to the bot error handler.
- Global filters (`APP_FILTER`) also see bot exceptions. Use `TelegramExecutionContext.isTelegram(host)` to tell them apart from HTTP requests.

## Error handling

Errors that no filter handles reach the `catch` option (default: logged with the Nest `Logger`). The module installs an error boundary in front of all middleware, so the same handler runs in polling **and** webhook mode — a failing handler never becomes an HTTP 500 that makes Telegram resend the update.

## Webhooks

With `mode: "webhook"` the module mounts `POST webhook.path` on the Nest HTTP adapter (Express) during `onModuleInit`. Requests without the right `X-Telegram-Bot-Api-Secret-Token` header are answered with `401`. Telegram needs a public HTTPS URL: in development use a tunnel such as `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`.

## Polling and concurrency

Polling uses `@grammyjs/runner`, which processes updates **concurrently**. If you use sessions or conversations, add `sequentialize()` from `@grammyjs/runner` as the first middleware so updates of the same chat run in order (see the configuration sample above).

## Testing

`@tgstack/nestjs-grammy/testing` ships an in-memory Bot API and update factories. No request ever leaves the process:

```ts
const api = new MockBotApi();
const moduleRef = await Test.createTestingModule({
  imports: [
    GrammyModule.forRoot({
      token: "1:TEST",
      mode: "none",
      botConfig: { botInfo: api.botInfo, client: api.clientOptions },
    }),
  ],
  providers: [GreetingUpdate],
}).compile();
const app = await moduleRef.createNestApplication().init();

const bot = app.get<Bot>(GRAMMY_BOT);
await bot.handleUpdate(createCommandUpdate("help"));
api.callsTo("sendMessage").map((call) => call.payload.text); // ["Commands: /start, /help"]
```

`MockBotApi#on(method, factory)` overrides a response, `fail(method, { error_code, description })` simulates API errors (`429`, `403`, …) and `pushUpdate()` feeds long polling.

Prefer `client: api.clientOptions` (a mocked `fetch`) over `transformers: [api.transformer]`: the conversations plugin builds a fresh `Api` from the bot's client options for every conversation step, and those instances do not inherit `bot.api` transformers.

## License

MIT
