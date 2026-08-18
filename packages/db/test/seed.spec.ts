import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import { parseTelegramIds, seed } from "../src/seed.js";
import { serializeBigInt } from "../src/serialization.js";
import { getTestDatabaseUrl, resetDatabase } from "../src/testing.js";

const prisma = createPrismaClient(getTestDatabaseUrl());

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("parseTelegramIds", () => {
  it("parses a comma-separated list", () => {
    expect(parseTelegramIds(" 1, 9007199254740993 ,,")).toEqual([1n, 9_007_199_254_740_993n]);
    expect(parseTelegramIds(undefined)).toEqual([]);
  });

  it("rejects garbage", () => {
    expect(() => parseTelegramIds("12,abc")).toThrow(/abc/);
  });
});

describe("seed", () => {
  it("creates products and promotes admins, idempotently", async () => {
    const adminTelegramIds = [9_007_199_254_740_993n];
    await seed(prisma, { adminTelegramIds });
    await seed(prisma, { adminTelegramIds });

    expect(await prisma.product.count()).toBe(3);
    const admin = await prisma.user.findUniqueOrThrow({
      where: { telegramId: adminTelegramIds[0] },
    });
    expect(admin.role).toBe("ADMIN");
    expect(admin.telegramId).toBe(9_007_199_254_740_993n);
    expect(serializeBigInt(admin).telegramId).toBe("9007199254740993");
  });

  it("promotes an existing user to admin", async () => {
    await prisma.user.create({ data: { telegramId: 5n, firstName: "Existing" } });
    await seed(prisma, { adminTelegramIds: [5n] });
    const user = await prisma.user.findUniqueOrThrow({ where: { telegramId: 5n } });
    expect(user).toMatchObject({ role: "ADMIN", firstName: "Existing" });
  });

  it("adds demo data on request", async () => {
    const result = await seed(prisma, { demo: true });
    expect(result.demoUsers).toBe(40);
    expect(await prisma.user.count()).toBe(40);
    expect(await prisma.payment.count()).toBe(result.demoPayments);
    await seed(prisma, { demo: true });
    expect(await prisma.user.count()).toBe(40);
  });
});
