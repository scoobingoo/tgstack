/**
 * Every code sample from README.md, type-checked by `pnpm typecheck`.
 * Keep the two files in sync: if a sample changes there, change it here.
 */
import { autoRetry } from "@grammyjs/auto-retry";
import { sequentialize } from "@grammyjs/runner";
import {
  type ArgumentsHost,
  type CanActivate,
  Catch,
  type ExceptionFilter,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Module,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  CallbackQuery,
  Command,
  Ctx,
  GRAMMY_BOT,
  GrammyModule,
  Hears,
  InjectBot,
  Message,
  On,
  Sender,
  Start,
  TelegramExecutionContext,
  Update,
} from "@tgstack/nestjs-grammy";
import { createCommandUpdate, MockBotApi } from "@tgstack/nestjs-grammy/testing";
import { type Bot, type Context, InlineKeyboard } from "grammy";
import type { User } from "grammy/types";

// ── Quick start ──────────────────────────────────────────────────────────────

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

// ── Async configuration ─────────────────────────────────────────────────────

@Module({
  imports: [
    ConfigModule.forRoot(),
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
    }),
  ],
})
export class ConfiguredAppModule {}

// ── Decorators ──────────────────────────────────────────────────────────────

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

// ── Injecting the bot ───────────────────────────────────────────────────────

@Injectable()
export class NotificationService {
  constructor(@InjectBot() private readonly bot: Bot<Context>) {}

  notify(chatId: number, text: string) {
    return this.bot.api.sendMessage(chatId, text);
  }
}

// ── Guards and exception filters ────────────────────────────────────────────

const ADMIN_IDS = new Set([123456789]);

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

// ── Testing ─────────────────────────────────────────────────────────────────

export async function testingExample() {
  const { Test } = await import("@nestjs/testing");
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
  const replies = api.callsTo("sendMessage").map((call) => call.payload.text);
  await app.close();
  return replies; // ["Commands: /start, /help"]
}
