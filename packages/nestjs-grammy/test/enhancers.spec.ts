import "reflect-metadata";
import {
  type ArgumentsHost,
  type CallHandler,
  type CanActivate,
  Catch,
  type ExceptionFilter,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Module,
  type NestInterceptor,
  type PipeTransform,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { Bot, Context } from "grammy";
import { map, type Observable } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";
import {
  Command,
  Ctx,
  GRAMMY_BOT,
  GRAMMY_CONTEXT_TYPE,
  GrammyModule,
  Message,
  TelegramExecutionContext,
  Update,
} from "../src/index.js";
import { createCommandUpdate, MockBotApi, testUser } from "../src/testing/index.js";

const calls: string[] = [];
const ADMIN_ID = 1;

@Injectable()
class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const telegram = TelegramExecutionContext.create(context);
    calls.push(`guard:${telegram.getType()}:${telegram.getClass()?.name}`);
    return telegram.getContext().from?.id === ADMIN_ID;
  }
}

class BusinessError extends Error {}

@Catch(BusinessError)
class ReplyErrorFilter implements ExceptionFilter {
  catch(exception: BusinessError, host: ArgumentsHost) {
    const ctx = TelegramExecutionContext.create(host).getContext();
    // Return the promise so Nest treats the exception as handled.
    return ctx.reply(`Oops: ${exception.message}`);
  }
}

@Catch(ForbiddenException)
class ForbiddenFilter implements ExceptionFilter {
  catch(_exception: ForbiddenException, host: ArgumentsHost) {
    if (!TelegramExecutionContext.isTelegram(host)) throw _exception;
    return TelegramExecutionContext.create(host).getContext().reply("Admins only");
  }
}

@Injectable()
class ShoutInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    calls.push("interceptor:before");
    return next.handle().pipe(map((value) => String(value).toUpperCase()));
  }
}

class TrimPipe implements PipeTransform<string, string> {
  transform(value: string) {
    return value.replace(/^\/\S+\s*/, "").trim();
  }
}

@Update()
class EnhancedUpdate {
  @Command("secret")
  @UseGuards(AdminGuard)
  secret() {
    calls.push("secret");
    return "the secret";
  }

  @Command("fail")
  @UseFilters(ReplyErrorFilter)
  fail() {
    throw new BusinessError("something broke");
  }

  @Command("shout")
  @UseInterceptors(ShoutInterceptor)
  shout(@Message("text", new TrimPipe()) text: string) {
    calls.push(`shout:${text}`);
    return text;
  }

  @Command("crash")
  crash(@Ctx() _ctx: Context) {
    throw new Error("unhandled");
  }
}

@Module({ providers: [EnhancedUpdate, AdminGuard] })
class EnhancedModule {}

async function createApp(withGlobalFilter = false) {
  const api = new MockBotApi();
  const errors: unknown[] = [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      GrammyModule.forRoot({
        token: "1:TEST",
        mode: "none",
        botConfig: { botInfo: api.botInfo },
        transformers: [api.transformer],
        catch: (err) => {
          errors.push(err.error);
        },
      }),
      EnhancedModule,
    ],
    providers: withGlobalFilter ? [{ provide: APP_FILTER, useClass: ForbiddenFilter }] : [],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return { app, api, errors, bot: app.get<Bot>(GRAMMY_BOT) };
}

afterEach(() => {
  calls.length = 0;
});

describe("guards", () => {
  it("lets allowed users through", async () => {
    const { app, api, bot } = await createApp();
    await bot.handleUpdate(
      createCommandUpdate("secret", "", { from: { ...testUser, id: ADMIN_ID } }),
    );
    expect(calls).toEqual([`guard:${GRAMMY_CONTEXT_TYPE}:EnhancedUpdate`, "secret"]);
    expect(api.callsTo("sendMessage")[0]?.payload.text).toBe("the secret");
    await app.close();
  });

  it("blocks a command and surfaces a ForbiddenException", async () => {
    const { app, api, bot, errors } = await createApp();
    await bot.handleUpdate(createCommandUpdate("secret"));
    expect(calls).toEqual([`guard:${GRAMMY_CONTEXT_TYPE}:EnhancedUpdate`]);
    expect(api.callsTo("sendMessage")).toHaveLength(0);
    expect(errors[0]).toBeInstanceOf(ForbiddenException);
    await app.close();
  });

  it("lets a global filter turn the denial into a reply", async () => {
    const { app, api, bot, errors } = await createApp(true);
    await bot.handleUpdate(createCommandUpdate("secret"));
    expect(api.callsTo("sendMessage")[0]?.payload.text).toBe("Admins only");
    expect(errors).toEqual([]);
    await app.close();
  });
});

describe("exception filters", () => {
  it("replies with an error message", async () => {
    const { app, api, bot, errors } = await createApp();
    await bot.handleUpdate(createCommandUpdate("fail"));
    expect(api.callsTo("sendMessage")[0]?.payload.text).toBe("Oops: something broke");
    expect(errors).toEqual([]);
    await app.close();
  });

  it("passes unhandled errors to the bot error handler", async () => {
    const { app, bot, errors } = await createApp();
    await bot.handleUpdate(createCommandUpdate("crash"));
    expect((errors[0] as Error).message).toBe("unhandled");
    await app.close();
  });
});

describe("interceptors and pipes", () => {
  it("wraps the handler and transforms params", async () => {
    const { app, api, bot } = await createApp();
    await bot.handleUpdate(createCommandUpdate("shout", "hello world"));
    expect(calls).toEqual(["interceptor:before", "shout:hello world"]);
    expect(api.callsTo("sendMessage")[0]?.payload.text).toBe("HELLO WORLD");
    await app.close();
  });
});
