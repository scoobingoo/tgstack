import { type DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { BotModule, type BotModuleOptions } from "./bot/bot.module.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { BigIntSerializerInterceptor } from "./common/interceptors/bigint-serializer.interceptor.js";
import { createValidationPipe } from "./common/pipes/validation.pipe.js";
import { ConfigModule } from "./config/app-config.js";
import type { Env } from "./config/env.js";
import { OnboardingModule } from "./examples/onboarding/onboarding.module.js";
import { ShopModule } from "./examples/shop/shop.module.js";
import { HealthModule } from "./infra/health/health.module.js";
import { LoggingModule } from "./infra/logging/logging.module.js";
import { PrismaModule } from "./infra/prisma/prisma.module.js";
import { QueueModule } from "./infra/queue/queue.module.js";
import { RedisModule } from "./infra/redis/redis.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { BroadcastsModule } from "./modules/broadcasts/broadcasts.module.js";
import { PaymentsModule } from "./modules/payments/payments.module.js";
import { StatsModule } from "./modules/stats/stats.module.js";
import { UsersModule } from "./modules/users/users.module.js";

export interface AppModuleOptions {
  /** Validated environment; loaded from `process.env` when omitted (tests pass their own). */
  env?: Env;
  /** Bot overrides for tests (mocked Bot API, mode). */
  bot?: BotModuleOptions;
}

/**
 * Root module of the API + bot process (`main.ts`): REST controllers, the
 * webhook or polling runner, SSE. It only *produces* queue jobs; processors
 * live in {@link WorkerModule} (`main.worker.ts`).
 */
@Module({})
export class AppModule {
  static forRoot(options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        // Infrastructure
        ConfigModule.forRoot(options.env),
        LoggingModule,
        PrismaModule,
        RedisModule,
        QueueModule,
        HealthModule,
        // Telegram bot (grammY middleware pipeline + core commands)
        BotModule.forRoot(options.bot),
        // Core domain
        UsersModule,
        AuthModule,
        StatsModule,
        PaymentsModule,
        BroadcastsModule,
        // EXAMPLE modules — delete freely (docs/examples.md).
        OnboardingModule,
        ShopModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_PIPE, useFactory: createValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: BigIntSerializerInterceptor },
      ],
    };
  }
}
