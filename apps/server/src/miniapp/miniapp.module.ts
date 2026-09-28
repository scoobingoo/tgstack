import { Module } from "@nestjs/common";
import { MiniAppMeController } from "./miniapp.controller.js";
import { MiniAppAuthGuard } from "./miniapp-auth.guard.js";

/** `/api/app/*`: endpoints for the Telegram Mini App, authenticated with initData. */
@Module({
  controllers: [MiniAppMeController],
  providers: [MiniAppAuthGuard],
  exports: [MiniAppAuthGuard],
})
export class MiniAppModule {}
