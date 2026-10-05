import {
  applyDecorators,
  type CanActivate,
  Controller,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import type { User } from "@tgstack/db";
import { errorResponseSchema, type InitData, validateInitData } from "@tgstack/shared";
import type { Request } from "express";
import { AppConfig } from "../config/app-config.js";
import { UsersService } from "../users/users.service.js";

export interface MiniAppRequest extends Request {
  miniApp?: { user: User; initData: InitData };
}

const SCHEME = /^tma\s+(.+)$/i;

/**
 * Authenticates Mini App requests: `Authorization: tma <Telegram.WebApp.initData>`.
 * The raw initData is verified with the bot token (HMAC) and must be younger than
 * `INITDATA_MAX_AGE_SECONDS`; only then is its user trusted and upserted.
 */
@Injectable()
export class MiniAppAuthGuard implements CanActivate {
  constructor(
    private readonly config: AppConfig,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<MiniAppRequest>();
    const header = request.headers.authorization;
    const raw = header ? SCHEME.exec(header)?.[1] : undefined;
    if (!raw) throw new UnauthorizedException("Missing `Authorization: tma <initData>` header");

    const result = await validateInitData(raw, this.config.env.BOT_TOKEN, {
      maxAgeSeconds: this.config.env.INITDATA_MAX_AGE_SECONDS,
    });
    if (!result.ok) throw new UnauthorizedException(`Invalid init data (${result.reason})`);
    const telegramUser = result.data.user;
    if (!telegramUser) throw new UnauthorizedException("Init data has no user");

    const user = await this.users.upsertFromTelegram({
      id: telegramUser.id,
      firstName: telegramUser.firstName,
      lastName: telegramUser.lastName,
      username: telegramUser.username,
      languageCode: telegramUser.languageCode,
    });
    request.miniApp = { user, initData: result.data };
    return true;
  }
}

/** `@Controller("app/<path>")` + {@link MiniAppAuthGuard} for every Mini App endpoint. */
export function MiniAppController(path: string, tag = "mini app"): ClassDecorator {
  return applyDecorators(
    Controller(path ? `app/${path}` : "app"),
    UseGuards(MiniAppAuthGuard),
    ApiTags(tag),
    ApiHeader({
      name: "Authorization",
      description: "tma <Telegram.WebApp.initData>",
      required: true,
    }),
    ApiUnauthorizedResponse({
      description: "Missing or invalid initData",
      standardSchema: errorResponseSchema,
    }),
  );
}

/** The verified Mini App user of the request. */
export const AppUser = createParamDecorator((_data: unknown, context: ExecutionContext): User => {
  const request = context.switchToHttp().getRequest<MiniAppRequest>();
  if (!request.miniApp) throw new UnauthorizedException();
  return request.miniApp.user;
});
