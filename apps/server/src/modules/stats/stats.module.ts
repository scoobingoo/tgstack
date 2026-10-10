import { Module } from "@nestjs/common";
import { StatsController } from "./stats.controller.js";
import { StatsService } from "./stats.service.js";

/** Dashboard metrics: `GET /api/admin/stats`. */
@Module({
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
