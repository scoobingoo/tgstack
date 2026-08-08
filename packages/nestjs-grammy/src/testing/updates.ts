import type { Chat, Message, Update, User } from "grammy/types";

let updateId = 1;
let messageId = 1;

export const testUser: User = {
  id: 100_000_001,
  is_bot: false,
  first_name: "Ada",
  last_name: "Lovelace",
  username: "ada",
  language_code: "en",
};

export interface UpdateOptions {
  from?: User;
  chat?: Chat;
  updateId?: number;
}

function privateChat(user: User): Chat.PrivateChat {
  return {
    id: user.id,
    type: "private",
    first_name: user.first_name,
    ...(user.last_name ? { last_name: user.last_name } : {}),
    ...(user.username ? { username: user.username } : {}),
  };
}

function baseMessage(from: User, chat: Chat | undefined): Omit<Message.TextMessage, "text"> {
  return {
    message_id: messageId++,
    date: Math.floor(Date.now() / 1000),
    from,
    chat: (chat ?? privateChat(from)) as Message["chat"],
  };
}

/** A private text message. Text starting with `/` gets a `bot_command` entity. */
export function createTextUpdate(text: string, options: UpdateOptions = {}): Update {
  const from = options.from ?? testUser;
  const command = /^\/\S+/.exec(text)?.[0];
  return {
    update_id: options.updateId ?? updateId++,
    message: {
      ...baseMessage(from, options.chat),
      text,
      ...(command
        ? { entities: [{ type: "bot_command", offset: 0, length: command.length }] }
        : {}),
    },
  } as Update;
}

/** Shortcut for `createTextUpdate("/command args")`. */
export function createCommandUpdate(
  command: string,
  args = "",
  options: UpdateOptions = {},
): Update {
  return createTextUpdate(`/${command}${args ? ` ${args}` : ""}`, options);
}

export function createCallbackQueryUpdate(data: string, options: UpdateOptions = {}): Update {
  const from = options.from ?? testUser;
  return {
    update_id: options.updateId ?? updateId++,
    callback_query: {
      id: String(updateId),
      from,
      chat_instance: "1",
      data,
      message: { ...baseMessage(from, options.chat), text: "Pick one" } as Message.TextMessage,
    },
  };
}

export function createInlineQueryUpdate(query: string, options: UpdateOptions = {}): Update {
  return {
    update_id: options.updateId ?? updateId++,
    inline_query: { id: String(updateId), from: options.from ?? testUser, query, offset: "" },
  };
}

export function createPhotoUpdate(caption?: string, options: UpdateOptions = {}): Update {
  const from = options.from ?? testUser;
  return {
    update_id: options.updateId ?? updateId++,
    message: {
      ...baseMessage(from, options.chat),
      photo: [{ file_id: "photo", file_unique_id: "photo-u", width: 90, height: 90 }],
      ...(caption ? { caption } : {}),
    },
  } as Update;
}
