// EXAMPLE: shop — products sold for Telegram Stars. Delete this folder and the
// `ShopModule` import in app.module.ts to remove it (docs/examples.md).
import { Module } from "@nestjs/common";
import { MiniAppModule } from "../../miniapp/miniapp.module.js";
import { ProductsService } from "./products.service.js";
import { ProductsAdminController } from "./products-admin.controller.js";
import { ShopAppController } from "./shop-app.controller.js";

@Module({
  imports: [MiniAppModule],
  controllers: [ProductsAdminController, ShopAppController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ShopModule {}
