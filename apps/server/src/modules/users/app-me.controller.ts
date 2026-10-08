import { Body, Get, Patch } from "@nestjs/common";
import { ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import type { User } from "@tgstack/db";
import {
  type AppMeDto,
  appMeSchema,
  type UpdateAppMeBody,
  updateAppMeSchema,
} from "@tgstack/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { AppUser, MiniAppController } from "./miniapp-auth.guard.js";

function toAppMe(user: User): AppMeDto {
  return {
    id: user.id,
    telegramId: user.telegramId.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    locale: user.locale,
    onboarding: user.onboarding,
  };
}

@MiniAppController("")
export class MiniAppMeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("me")
  @ApiOperation({ summary: "The Mini App user (verified from initData)" })
  @ApiOkResponse({ standardSchema: appMeSchema })
  me(@AppUser() user: User): AppMeDto {
    return toAppMe(user);
  }

  @Patch("me")
  @ApiOperation({ summary: "Change the user's language — the bot answers in it too" })
  @ApiOkResponse({ standardSchema: appMeSchema })
  async update(
    @AppUser() user: User,
    @Body({ schema: updateAppMeSchema }) body: UpdateAppMeBody,
  ): Promise<AppMeDto> {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { locale: body.locale },
    });
    return toAppMe(updated);
  }
}
