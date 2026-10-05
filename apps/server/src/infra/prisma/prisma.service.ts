import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { createPrismaAdapter, PrismaClient } from "@tgstack/db";
import { AppConfig } from "../config/app-config.js";

/** Prisma Client as a Nest provider; connects on init and disconnects on shutdown. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: AppConfig) {
    super({ adapter: createPrismaAdapter(config.env.DATABASE_URL) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
