// EXAMPLE: `/buy` — pick a product, receive a Telegram Stars invoice in the chat.
import { type OnModuleInit } from "@nestjs/common";
import { CallbackQuery, Command, Ctx, Update } from "@tgstack/nestjs-grammy";
import { InlineKeyboard } from "grammy";
import type { BotContext } from "../../bot/bot.context.js";
import { BotCommandsRegistry } from "../../bot/bot-commands.registry.js";
import { TelegramStarsProvider } from "../../modules/payments/providers/telegram-stars.provider.js";
import { ProductsService } from "./products.service.js";

export const BUY_CALLBACK = /^buy:([\w-]+)$/;

@Update()
export class ShopUpdate implements OnModuleInit {
  constructor(
    private readonly products: ProductsService,
    private readonly stars: TelegramStarsProvider,
    private readonly commands: BotCommandsRegistry,
  ) {}

  onModuleInit(): void {
    this.commands.register({ command: "buy", descriptionKey: "command-buy" });
  }

  @Command("buy")
  async list(@Ctx() ctx: BotContext): Promise<void> {
    const products = await this.products.listActive();
    if (products.length === 0) {
      await ctx.reply(ctx.t("shop-empty"));
      return;
    }
    // One product per row.
    const keyboard = InlineKeyboard.from(
      products.map((product) => [
        InlineKeyboard.text(`${product.title} — ${product.priceStars} ⭐`, `buy:${product.id}`),
      ]),
    );
    await ctx.reply(ctx.t("shop-choose"), { reply_markup: keyboard });
  }

  @CallbackQuery(BUY_CALLBACK)
  async invoice(@Ctx() ctx: BotContext & { match: RegExpMatchArray }): Promise<void> {
    await ctx.answerCallbackQuery();
    const product = await this.products.getActive(ctx.match[1] ?? "").catch(() => null);
    if (!product || ctx.chatId === undefined) {
      await ctx.reply(ctx.t("payment-error-unavailable"));
      return;
    }
    await this.stars.createInvoice(
      {
        user: ctx.user,
        item: {
          productId: product.id,
          title: product.title,
          description: product.description,
          amount: product.priceStars,
          photoUrl: product.imageUrl,
        },
      },
      { type: "chat", chatId: ctx.chatId },
    );
  }
}
