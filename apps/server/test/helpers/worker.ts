import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplicationContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MockBotApi } from "@tgstack/nestjs-grammy/testing";
import type { BroadcastsWorkerModuleOptions } from "../../src/modules/broadcasts/broadcasts-worker.module.js";
import { WorkerModule } from "../../src/worker.module.js";
import { createTestEnv } from "./env.js";

/** Boots the worker process (main.worker.ts equivalent) against the test database and Redis. */
export async function createWorkerTestApp(
  options: BroadcastsWorkerModuleOptions & { api?: MockBotApi } = {},
): Promise<{ worker: INestApplicationContext; api: MockBotApi; heartbeatFile: string }> {
  const { api = new MockBotApi(), ...broadcasts } = options;
  const heartbeatFile = join(tmpdir(), `tgstack-test-${randomUUID()}.heartbeat`);
  const moduleRef = await Test.createTestingModule({
    imports: [
      WorkerModule.forRoot({
        env: createTestEnv(),
        broadcasts: { client: api.clientOptions, ...broadcasts },
        heartbeatFile,
      }),
    ],
  }).compile();
  // A testing module is an application context, like NestFactory.createApplicationContext().
  await moduleRef.init();
  return { worker: moduleRef, api, heartbeatFile };
}
