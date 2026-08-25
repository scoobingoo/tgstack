import { type DynamicModule, Global, Module } from "@nestjs/common";
import { type Env, loadEnv } from "./env.js";

/** Validated, typed configuration. Inject it anywhere: `constructor(private config: AppConfig)`. */
export class AppConfig {
  constructor(readonly env: Env) {}

  get isProduction(): boolean {
    return this.env.NODE_ENV === "production";
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === "test";
  }

  /** Origins allowed by CORS: the admin dashboard and the Mini App. */
  get corsOrigins(): string[] {
    return [new URL(this.env.ADMIN_URL).origin, new URL(this.env.MINIAPP_URL).origin];
  }
}

@Global()
@Module({})
export class ConfigModule {
  /** Pass `env` in tests; by default the process environment is loaded and validated. */
  static forRoot(env?: Env): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: AppConfig, useFactory: () => new AppConfig(env ?? loadEnv()) }],
      exports: [AppConfig],
    };
  }
}
