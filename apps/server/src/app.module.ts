import { type DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { BotModule, type BotModuleOptions } from "./bot/bot.module.js";
import { AllExceptionsFilter } from "./common/all-exceptions.filter.js";
import { LoggingModule } from "./common/logging.js";
import { ConfigModule } from "./config/app-config.js";
import type { Env } from "./config/env.js";
import { OnboardingModule } from "./examples/onboarding/onboarding.module.js";
import { HealthModule } from "./health/health.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { RedisModule } from "./redis/redis.module.js";
import { UsersModule } from "./users/users.module.js";

export interface AppModuleOptions {
  /** Validated environment; loaded from `process.env` when omitted (tests pass their own). */
  env?: Env;
  /** Bot overrides for tests (mocked Bot API, mode). */
  bot?: BotModuleOptions;
}

/** HTTP API + bot process (`main.ts`). */
@Module({})
export class AppModule {
  static forRoot(options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(options.env),
        LoggingModule,
        PrismaModule,
        RedisModule,
        HealthModule,
        BotModule.forRoot(options.bot),
        UsersModule,
        // EXAMPLE modules — delete freely (docs/examples.md).
        OnboardingModule,
      ],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    };
  }
}
