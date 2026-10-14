import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  type ExchangeTokenBody,
  errorResponseSchema,
  exchangeTokenSchema,
  SESSION_COOKIE,
  type SessionDto,
  sessionSchema,
} from "@tgstack/shared";
import type { CookieOptions, Response } from "express";
import { AdminGuard, type AuthenticatedRequest } from "../../common/guards/admin.guard.js";
import { AppConfig } from "../../config/app-config.js";
import { toUserDto } from "../users/users.mapper.js";
import { AuthService, SESSION_TTL_SECONDS } from "./auth.service.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Post("exchange")
  @HttpCode(200)
  @ApiOperation({
    summary: "Exchange a magic-link token (from /admin in the bot) for a session cookie",
  })
  @ApiOkResponse({ standardSchema: sessionSchema })
  @ApiUnauthorizedResponse({
    description: "Unknown, used or expired token",
    standardSchema: errorResponseSchema,
  })
  async exchange(
    @Body({ schema: exchangeTokenSchema }) body: ExchangeTokenBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionDto> {
    const session = await this.auth.exchange(body.token);
    response.cookie(SESSION_COOKIE, session.token, this.cookieOptions(SESSION_TTL_SECONDS * 1000));
    return { user: toUserDto(session.user), expiresAt: session.expiresAt.toISOString() };
  }

  @Get("me")
  @UseGuards(AdminGuard)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "The signed-in admin" })
  @ApiOkResponse({ standardSchema: sessionSchema })
  @ApiUnauthorizedResponse({ standardSchema: errorResponseSchema })
  me(@Req() request: AuthenticatedRequest): SessionDto {
    const admin = request.admin;
    if (!admin) throw new UnauthorizedException();
    return { user: toUserDto(admin.user), expiresAt: admin.expiresAt.toISOString() };
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: "End the session and clear the cookie" })
  @ApiNoContentResponse()
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (request.admin) await this.auth.revoke(request.admin.sessionId);
    response.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  private cookieOptions(maxAge?: number): CookieOptions {
    return {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.isProduction,
      path: "/",
      ...(maxAge === undefined ? {} : { maxAge }),
    };
  }
}
