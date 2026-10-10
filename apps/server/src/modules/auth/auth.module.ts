import { Global, Module } from "@nestjs/common";
import { AdminGuard } from "../../common/guards/admin.guard.js";
import { BotAdminGuard } from "../../common/guards/bot-admin.guard.js";
import { AdminLinkUpdate } from "./admin-link.update.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";

/** Admin authentication: bot magic link → session cookie (decision D4). */
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, AdminGuard, BotAdminGuard, AdminLinkUpdate],
  exports: [AuthService, AdminGuard],
})
export class AuthModule {}
