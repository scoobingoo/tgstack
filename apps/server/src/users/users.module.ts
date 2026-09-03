import { Module } from "@nestjs/common";
import { AdminPromotionService } from "./admin-promotion.service.js";

@Module({
  providers: [AdminPromotionService],
})
export class UsersModule {}
