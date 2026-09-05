// EXAMPLE: shop — products sold for Telegram Stars. Delete this folder and the
// `ShopModule` import in app.module.ts to remove it (docs/examples.md).
import { Module } from "@nestjs/common";
import { ProductsService } from "./products.service.js";
import { ProductsAdminController } from "./products-admin.controller.js";

@Module({
  controllers: [ProductsAdminController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ShopModule {}
