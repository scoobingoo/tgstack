import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService, HealthIndicatorService } from "@nestjs/terminus";
import { Redis } from "ioredis";
import { PrismaService } from "../prisma/prisma.service.js";
import { InjectRedis } from "../redis/redis.module.js";

const CHECK_TIMEOUT_MS = 2_000;

@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /** Liveness + readiness: `200` when Postgres and Redis answer, `503` otherwise. */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () =>
        this.indicators
          .check("database")
          .attempt(async () => {
            await this.prisma.$queryRaw`SELECT 1`;
          })
          .withTimeout(CHECK_TIMEOUT_MS),
      () =>
        this.indicators
          .check("redis")
          .attempt(async () => {
            await this.redis.ping();
          })
          .withTimeout(CHECK_TIMEOUT_MS),
    ]);
  }
}
