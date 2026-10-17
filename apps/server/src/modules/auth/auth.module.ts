import { Global, Module } from "@nestjs/common";
import { AdminGuard } from "../../common/guards/admin.guard.js";
import { BotAdminGuard } from "../../common/guards/bot-admin.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";

/** Admin authentication: magic link → session cookie (decision D4). The bot side is `/admin` in `bot/updates`. */
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, AdminGuard, BotAdminGuard],
  exports: [AuthService, AdminGuard],
})
export class AuthModule {}
