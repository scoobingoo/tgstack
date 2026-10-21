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

  /** PayOS credentials, or `null` when PayOS is not configured. */
  get payos(): {
    clientId: string;
    apiKey: string;
    checksumKey: string;
    baseUrl: string;
  } | null {
    const { PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY, PAYOS_API_URL } = this.env;
    if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) return null;
    return {
      clientId: PAYOS_CLIENT_ID,
      apiKey: PAYOS_API_KEY,
      checksumKey: PAYOS_CHECKSUM_KEY,
      baseUrl: PAYOS_API_URL,
    };
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
