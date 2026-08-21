import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Redis, type RedisOptions } from "ioredis";
import { AppConfig } from "../config/app-config.js";

/** Injection token of the shared ioredis client. Use `@InjectRedis()`. */
export const REDIS = Symbol("REDIS");
export const InjectRedis = (): ParameterDecorator => Inject(REDIS);

/**
 * Creates an ioredis client that reports connection errors through the Nest
 * logger (once per outage) instead of ioredis' "Unhandled error event" output.
 */
export function createRedis(url: string, name: string, options: RedisOptions = {}): Redis {
  const logger = new Logger(name);
  const redis = new Redis(url, { maxRetriesPerRequest: 3, ...options });
  let failing = false;
  redis.on("error", (error: Error) => {
    if (!failing) logger.error(`Connection error: ${error.message}`);
    failing = true;
  });
  redis.on("ready", () => {
    if (failing) logger.log("Reconnected");
    failing = false;
  });
  return redis;
}

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== "end") await this.redis.quit();
  }
}

/** One shared Redis connection for sessions, magic-link tokens and caches. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createRedis(config.env.REDIS_URL, "Redis"),
    },
    RedisShutdown,
  ],
  exports: [REDIS],
})
export class RedisModule {}
