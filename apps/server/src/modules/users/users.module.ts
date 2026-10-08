import { Global, Module } from "@nestjs/common";
import { AdminPromotionService } from "./admin-promotion.service.js";
import { UsersService } from "./users.service.js";

@Global()
@Module({
  providers: [AdminPromotionService, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
