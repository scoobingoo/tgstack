// EXAMPLE: entry point of the onboarding wizard.
import { Command, Ctx, Update } from "@tgstack/nestjs-grammy";
import type { BotContext } from "../../bot/bot.context.js";
import { ONBOARDING_CONVERSATION } from "./onboarding.conversation.js";

@Update()
export class OnboardingUpdate {
  @Command("onboarding")
  async start(@Ctx() ctx: BotContext): Promise<void> {
    await ctx.conversation.exitAll();
    await ctx.conversation.enter(ONBOARDING_CONVERSATION);
  }
}
