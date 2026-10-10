import { Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import { type StatsDto, statsSchema } from "@tgstack/shared";
import { AdminController } from "../../common/decorators/admin-controller.decorator.js";
import { StatsService } from "./stats.service.js";

@AdminController("stats", "admin: stats")
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  @ApiOperation({ summary: "Dashboard numbers: users, activity, revenue, 30-day sign-ups" })
  @ApiOkResponse({ standardSchema: statsSchema })
  get(): Promise<StatsDto> {
    return this.stats.getStats();
  }
}
