// EXAMPLE: onboarding wizard built with the grammY conversations plugin.
// Remove the whole `examples/onboarding` folder and its import in app.module.ts
// to delete it (see docs/examples.md).
import { type Conversation, createConversation } from "@grammyjs/conversations";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import { createTranslator, negotiateLocale } from "@tgstack/i18n";
import { InjectBot } from "@tgstack/nestjs-grammy";
import { escapeHtml } from "@tgstack/shared";
import { type Bot, InlineKeyboard } from "grammy";
import type { BotContext, ConversationContext } from "../../bot/bot.context.js";
import { BotCommandsRegistry } from "../../bot/bot-commands.registry.js";
import { PrismaService } from "../../infra/prisma/prisma.service.js";

export const ONBOARDING_CONVERSATION = "onboarding";

const INTERESTS = ["news", "deals", "both"] as const;
type Interest = (typeof INTERESTS)[number];

/** Shape stored in `User.onboarding`. */
export interface OnboardingAnswers {
  name: string;
  interest: Interest;
  completedAt: string;
}

type OnboardingConversation = Conversation<BotContext, ConversationContext>;

@Injectable()
export class OnboardingConversationProvider implements OnModuleInit {
  constructor(
    @InjectBot() private readonly bot: Bot<BotContext>,
    private readonly prisma: PrismaService,
    private readonly commands: BotCommandsRegistry,
  ) {}

  /** Runs before bot handlers are registered (on bootstrap), right after the global middleware. */
  onModuleInit(): void {
    this.bot.use(createConversation(this.wizard, { id: ONBOARDING_CONVERSATION }));
    this.commands.register({ command: "onboarding", descriptionKey: "command-onboarding" });
  }

  /**
   * Asks for a name, then an interest (buttons), then confirmation, and saves the
   * answers on the user. State lives in Redis, so the wizard survives restarts.
   * Code with side effects goes through `conversation.external()` — conversations
   * are replayed on every update.
   */
  private readonly wizard = async (
    conversation: OnboardingConversation,
    ctx: ConversationContext,
  ): Promise<void> => {
    const locale = await conversation.external((outer) => outer.user.locale);
    const t = createTranslator(negotiateLocale(locale), "bot");

    for (;;) {
      await ctx.reply(t("onboarding-ask-name"));
      const name = await this.askName(conversation, t("onboarding-name-invalid"));

      const interestKeyboard = new InlineKeyboard();
      for (const interest of INTERESTS) {
        interestKeyboard.text(
          t(`onboarding-interest-${interest}`),
          `onboarding:interest:${interest}`,
        );
      }
      await ctx.reply(t("onboarding-ask-interest", { name: escapeHtml(name) }), {
        parse_mode: "HTML",
        reply_markup: interestKeyboard,
      });
      const interestCtx = await conversation.waitForCallbackQuery(
        /^onboarding:interest:(news|deals|both)$/,
        {
          otherwise: (other) => other.reply(t("onboarding-use-buttons")),
        },
      );
      const interest = interestCtx.match[1] as Interest;
      await interestCtx.answerCallbackQuery();

      await ctx.reply(
        t("onboarding-confirm", {
          name: escapeHtml(name),
          interest: t(`onboarding-interest-${interest}`),
        }),
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text(t("onboarding-confirm-yes"), "onboarding:confirm:yes")
            .text(t("onboarding-confirm-no"), "onboarding:confirm:no"),
        },
      );
      const confirmCtx = await conversation.waitForCallbackQuery(/^onboarding:confirm:(yes|no)$/, {
        otherwise: (other) => other.reply(t("onboarding-use-buttons")),
      });
      await confirmCtx.answerCallbackQuery();

      if (confirmCtx.match[1] === "yes") {
        const answers: OnboardingAnswers = {
          name,
          interest,
          completedAt: new Date(await conversation.now()).toISOString(),
        };
        await conversation.external(async (outer) => {
          await this.prisma.user.update({
            where: { id: outer.user.id },
            data: { onboarding: { ...answers } },
          });
        });
        await ctx.reply(t("onboarding-saved", { name: escapeHtml(name) }), { parse_mode: "HTML" });
        return;
      }
      await ctx.reply(t("onboarding-restart"));
    }
  };

  private async askName(
    conversation: OnboardingConversation,
    invalidMessage: string,
  ): Promise<string> {
    for (;;) {
      const answer = await conversation.waitFor("message:text", {
        otherwise: (other) => other.reply(invalidMessage),
      });
      const name = answer.message.text.trim();
      if (name.length >= 1 && name.length <= 64 && !name.startsWith("/")) return name;
      await answer.reply(invalidMessage);
    }
  }
}
