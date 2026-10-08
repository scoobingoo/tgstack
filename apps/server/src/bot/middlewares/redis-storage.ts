import type { StorageAdapter } from "grammy";
import type { Redis } from "ioredis";

/**
 * grammY storage adapter on top of the shared ioredis client. Used for sessions
 * and conversation state, so both survive restarts and work across instances.
 */
export class RedisStorage<T> implements StorageAdapter<T> {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
    /** Expire idle entries after this many seconds (refreshed on every write). */
    private readonly ttlSeconds?: number,
  ) {}

  async read(key: string): Promise<T | undefined> {
    const value = await this.redis.get(this.prefix + key);
    return value === null ? undefined : (JSON.parse(value) as T);
  }

  async write(key: string, value: T): Promise<void> {
    const json = JSON.stringify(value);
    if (this.ttlSeconds) {
      await this.redis.set(this.prefix + key, json, "EX", this.ttlSeconds);
    } else {
      await this.redis.set(this.prefix + key, json);
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }
}
