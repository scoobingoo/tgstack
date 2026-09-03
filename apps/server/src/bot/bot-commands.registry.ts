import { Injectable } from "@nestjs/common";

export interface BotCommandDefinition {
  /** Command without the slash, e.g. `"help"`. */
  command: string;
  /** Key in `bot.ftl` with the command description shown in Telegram's menu. */
  descriptionKey: string;
  /** Only listed in the menu of admins (`ADMIN_TELEGRAM_IDS`). */
  adminOnly?: boolean;
}

/**
 * Commands published with `setMyCommands` on boot, in order. Feature modules
 * (including the examples) register their own commands in `onModuleInit`, so
 * deleting a module also removes its commands from the menu.
 */
@Injectable()
export class BotCommandsRegistry {
  private readonly commands: BotCommandDefinition[] = [
    { command: "start", descriptionKey: "command-start" },
    { command: "help", descriptionKey: "command-help" },
    { command: "language", descriptionKey: "command-language" },
  ];

  register(definition: BotCommandDefinition): void {
    if (!this.commands.some((existing) => existing.command === definition.command)) {
      this.commands.push(definition);
    }
  }

  list(options: { includeAdmin: boolean }): BotCommandDefinition[] {
    const visible = this.commands.filter((c) => options.includeAdmin || !c.adminOnly);
    // `/cancel` always goes last.
    return [...visible, { command: "cancel", descriptionKey: "command-cancel" }];
  }
}
