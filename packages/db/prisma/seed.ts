import { pathToFileURL } from "node:url";
import { createPrismaClient } from "../src/client.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

export interface SeedOptions {
  /** Telegram user IDs promoted to ADMIN (from `ADMIN_TELEGRAM_IDS`). */
  adminTelegramIds?: readonly bigint[];
  /** Also create demo users, payments and a broadcast so the dashboard has data. */
  demo?: boolean;
}

export interface SeedResult {
  products: number;
  admins: number;
  demoUsers: number;
  demoPayments: number;
}

// EXAMPLE: shop catalogue. Fixed IDs keep the seed idempotent.
const PRODUCTS = [
  {
    id: "seed_coffee",
    title: "Coffee for the team",
    description: "Buy the maintainers a coffee. Thank you!",
    priceStars: 10,
  },
  {
    id: "seed_stickers",
    title: "Premium sticker pack",
    description: "A pack of 24 animated stickers.",
    priceStars: 25,
  },
  {
    id: "seed_pro",
    title: "Pro plan (30 days)",
    description: "Unlocks every Pro feature for a month.",
    priceStars: 100,
  },
] as const;

/** Parses `ADMIN_TELEGRAM_IDS` ("123, 456") into BigInts, ignoring blanks. */
export function parseTelegramIds(value: string | undefined): bigint[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      if (!/^\d+$/.test(part))
        throw new Error(`Invalid Telegram ID in ADMIN_TELEGRAM_IDS: "${part}"`);
      return BigInt(part);
    });
}

const DEMO_FIRST_NAMES = [
  "Linh",
  "Minh",
  "Alex",
  "Sam",
  "Mai",
  "Huy",
  "Jordan",
  "Thao",
  "Kim",
  "Lan",
];
const DEMO_LOCALES = ["en", "vi"];
const DEMO_ID_BASE = 7_000_000_000n;
const DAY = 24 * 60 * 60 * 1000;

/** Idempotent seed: running it twice leaves the same data. */
export async function seed(prisma: PrismaClient, options: SeedOptions = {}): Promise<SeedResult> {
  for (const product of PRODUCTS) {
    await prisma.product.upsert({ where: { id: product.id }, update: {}, create: product });
  }

  for (const telegramId of options.adminTelegramIds ?? []) {
    await prisma.user.upsert({
      where: { telegramId },
      update: { role: "ADMIN" },
      create: { telegramId, firstName: "Admin", role: "ADMIN" },
    });
  }

  let demoUsers = 0;
  let demoPayments = 0;
  if (options.demo) {
    const now = Date.now();
    for (let i = 0; i < 40; i++) {
      const createdAt = new Date(now - ((i * 17) % 30) * DAY - i * 3_600_000);
      const user = await prisma.user.upsert({
        where: { telegramId: DEMO_ID_BASE + BigInt(i) },
        update: {},
        create: {
          telegramId: DEMO_ID_BASE + BigInt(i),
          firstName: DEMO_FIRST_NAMES[i % DEMO_FIRST_NAMES.length] ?? "Demo",
          username: `demo_user_${i}`,
          languageCode: DEMO_LOCALES[i % 2],
          locale: DEMO_LOCALES[i % 2] ?? "en",
          isBlocked: i % 13 === 0,
          createdAt,
          lastSeenAt: new Date(Math.min(now, createdAt.getTime() + (i % 9) * DAY)),
        },
      });
      demoUsers++;

      if (i % 4 === 0) {
        const product = PRODUCTS[i % PRODUCTS.length] ?? PRODUCTS[0];
        await prisma.payment.upsert({
          where: { telegramPaymentChargeId: `demo_charge_${i}` },
          update: {},
          create: {
            userId: user.id,
            productId: product.id,
            amount: product.priceStars,
            currency: "XTR",
            provider: "telegram-stars",
            telegramPaymentChargeId: `demo_charge_${i}`,
            invoicePayload: "demo",
            createdAt: new Date(Math.min(now, createdAt.getTime() + DAY / 2)),
          },
        });
        demoPayments++;
      }
    }
  }

  return {
    products: PRODUCTS.length,
    admins: options.adminTelegramIds?.length ?? 0,
    demoUsers,
    demoPayments,
  };
}

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    const result = await seed(prisma, {
      adminTelegramIds: parseTelegramIds(process.env.ADMIN_TELEGRAM_IDS),
      demo: process.argv.includes("--demo"),
    });
    console.log(
      `Seeded ${result.products} products, ${result.admins} admin(s)` +
        (result.demoUsers
          ? `, ${result.demoUsers} demo users, ${result.demoPayments} demo payments`
          : ""),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
