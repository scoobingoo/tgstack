import { Inject } from "@nestjs/common";
import { GRAMMY_BOT } from "../grammy.constants.js";

/** Injects the grammY `Bot` instance: `constructor(@InjectBot() bot: Bot<MyContext>)`. */
export const InjectBot = (): PropertyDecorator & ParameterDecorator => Inject(GRAMMY_BOT);
