/** Injection token of the resolved {@link GrammyModuleOptions}. */
export const GRAMMY_MODULE_OPTIONS = Symbol("GRAMMY_MODULE_OPTIONS");

/** Injection token of the grammY `Bot` instance. Prefer `@InjectBot()`. */
export const GRAMMY_BOT = Symbol("GRAMMY_BOT");

/** Value returned by `ArgumentsHost#getType()` while a bot handler runs. */
export const GRAMMY_CONTEXT_TYPE = "grammy";
export type GrammyContextType = typeof GRAMMY_CONTEXT_TYPE;

export const UPDATE_METADATA = "grammy:update";
export const LISTENERS_METADATA = "grammy:listeners";
export const PARAM_ARGS_METADATA = "grammy:param_args";

export const DEFAULT_WEBHOOK_PATH = "/telegram/webhook";
