import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { TelegramExecutionContext } from "@tgstack/nestjs-grammy";
import type { BotContext } from "../../bot/bot.context.js";

/** Bot handlers for admins only. Others get a polite "not allowed" reply. */
@Injectable()
export class BotAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const ctx = TelegramExecutionContext.create(context).getContext<BotContext>();
    return ctx.user?.role === "ADMIN";
  }
}
