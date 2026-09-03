import type { ConversationFlavor } from "@grammyjs/conversations";
import type { I18nFlavor } from "@grammyjs/i18n";
import type { User } from "@tgstack/db";
import type { Context, SessionFlavor } from "grammy";

/**
 * Per-chat state kept in Redis by the session middleware.
 * Add fields your features need; keep them JSON-serialisable.
 */
export interface SessionData {
  /** Example field: how many times /start was sent in this chat. */
  startCount?: number;
}

/** `ctx.user`: the database user behind the update, upserted by the user middleware. */
export interface UserFlavor {
  user: User;
}

/** Context type of every bot handler outside conversations. */
export type BotContext = ConversationFlavor<
  Context & SessionFlavor<SessionData> & I18nFlavor & UserFlavor
>;

/** Context type inside conversations: plain grammY context (plugins are not re-run there). */
export type ConversationContext = Context;
