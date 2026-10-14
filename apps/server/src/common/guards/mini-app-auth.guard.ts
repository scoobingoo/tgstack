import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { User } from "@tgstack/db";
import { type InitData, MINI_APP_AUTH_SCHEME, validateInitData } from "@tgstack/shared";
import type { Request } from "express";
import { AppConfig } from "../../config/app-config.js";
import { UsersService } from "../../modules/users/users.service.js";

export interface MiniAppRequest extends Request {
  miniApp?: { user: User; initData: InitData };
}

const SCHEME = new RegExp(`^${MINI_APP_AUTH_SCHEME}\\s+(.+)$`, "i");

/**
 * Authenticates Mini App requests: `Authorization: tma <Telegram.WebApp.initData>`.
 * The raw initData is verified with the bot token (HMAC) and must be younger than
 * `INITDATA_MAX_AGE_SECONDS`; only then is its user trusted and upserted.
 * Apply it with `@MiniAppController()`.
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
