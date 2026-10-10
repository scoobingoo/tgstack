import { Global, Module } from "@nestjs/common";
import { AdminPromotionService } from "./admin-promotion.service.js";
import { AppMeController } from "./app-me.controller.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";
import { UsersAdminService } from "./users-admin.service.js";

/**
 * Users: the upsert used by the bot and the Mini App guard (global), the admin
 * endpoints `/api/admin/users/*` and the Mini App profile `/api/app/me`.
 */
@Global()
@Module({
  controllers: [UsersController, AppMeController],
  providers: [AdminPromotionService, UsersService, UsersAdminService],
  exports: [UsersService],
})
export class UsersModule {}
