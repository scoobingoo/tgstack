import type { Broadcast } from "@tgstack/db";
import type { Api } from "grammy";
import type { InlineKeyboardMarkup } from "grammy/types";

export type BroadcastContent = Pick<Broadcast, "text" | "imageUrl" | "buttonText" | "buttonUrl">;

/**
 * Sends one broadcast message: a photo with an HTML caption, or an HTML text
 * message, plus an optional URL button. Used for previews and by the worker.
 */
export async function sendBroadcastMessage(
  api: Api,
  chatId: number,
  content: BroadcastContent,
): Promise<void> {
  const replyMarkup: InlineKeyboardMarkup | undefined =
    content.buttonText && content.buttonUrl
      ? { inline_keyboard: [[{ text: content.buttonText, url: content.buttonUrl }]] }
      : undefined;
  const markup = replyMarkup ? { reply_markup: replyMarkup } : {};

  if (content.imageUrl) {
    await api.sendPhoto(chatId, content.imageUrl, {
      caption: content.text,
      parse_mode: "HTML",
      ...markup,
    });
    return;
  }
  await api.sendMessage(chatId, content.text, { parse_mode: "HTML", ...markup });
}
