// EXAMPLE: shop endpoints for the Mini App (product list → Telegram Stars invoice).
import { Get, Param, Post } from "@nestjs/common";
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import type { User } from "@tgstack/db";
import {
  errorResponseSchema,
  type InvoiceLinkDto,
  invoiceLinkSchema,
  type ProductDto,
  productSchema,
} from "@tgstack/shared";
import { z } from "zod";
import { AppUser, MiniAppController } from "../../miniapp/miniapp-auth.guard.js";
import { TelegramStarsProvider } from "../../payments/telegram-stars.provider.js";
import { ProductsService } from "./products.service.js";

@MiniAppController("products", "mini app: shop (example)")
export class ShopAppController {
  constructor(
    private readonly products: ProductsService,
    private readonly stars: TelegramStarsProvider,
  ) {}

  @Get()
  @ApiOperation({ summary: "Products on sale, cheapest first" })
  @ApiOkResponse({ standardSchema: z.array(productSchema) })
  list(): Promise<ProductDto[]> {
    return this.products.listActive();
  }

  @Post(":id/invoice")
  @ApiOperation({ summary: "A Telegram Stars invoice link for `Telegram.WebApp.openInvoice()`" })
  @ApiOkResponse({ standardSchema: invoiceLinkSchema })
  @ApiNotFoundResponse({
    description: "Unknown or inactive product",
    standardSchema: errorResponseSchema,
  })
  async invoice(@Param("id") id: string, @AppUser() user: User): Promise<InvoiceLinkDto> {
    const product = await this.products.getActive(id);
    const invoice = await this.stars.createInvoice(
      {
        user,
        item: {
          productId: product.id,
          title: product.title,
          description: product.description,
          amount: product.priceStars,
          photoUrl: product.imageUrl,
        },
      },
      { type: "link" },
    );
    if (invoice.type !== "link") throw new Error("Expected an invoice link");
    return { url: invoice.url };
  }
}
