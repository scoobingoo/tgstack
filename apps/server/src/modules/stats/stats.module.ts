import { Module } from "@nestjs/common";
import { StatsController } from "./stats.controller.js";
import { StatsService } from "./stats.service.js";
import { UsersAdminController } from "./users-admin.controller.js";
import { UsersAdminService } from "./users-admin.service.js";

/** `/api/admin/*` endpoints of the dashboard (every controller uses `@AdminController`). */
@Module({
  controllers: [StatsController, UsersAdminController],
  providers: [StatsService, UsersAdminService],
})
export class AdminModule {}
