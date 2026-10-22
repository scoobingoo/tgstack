// EXAMPLE: shop endpoints for the Mini App (product list → Telegram Stars invoice or PayOS bank transfer).
import { BadRequestException, Get, Param, Post } from "@nestjs/common";
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import type { User } from "@tgstack/db";
import {
  type CheckoutDto,
  checkoutSchema,
  errorResponseSchema,
  type InvoiceLinkDto,
  invoiceLinkSchema,
  type ProductDto,
  productSchema,
} from "@tgstack/shared";
import { z } from "zod";
import { AppUser } from "../../common/decorators/app-user.decorator.js";
import { MiniAppController } from "../../common/decorators/mini-app-controller.decorator.js";
import { PayOsProvider } from "../../modules/payments/providers/payos/payos.provider.js";
import { TelegramStarsProvider } from "../../modules/payments/providers/telegram-stars.provider.js";
import { ProductsService } from "./products.service.js";

@MiniAppController("products", "mini app: shop (example)")
export class ShopAppController {
  constructor(
    private readonly products: ProductsService,
    private readonly stars: TelegramStarsProvider,
    private readonly payos: PayOsProvider,
  ) {}

  @Get()
  @ApiOperation({ summary: "Products on sale, cheapest first" })
  @ApiOkResponse({ standardSchema: z.array(productSchema) })
  async list(): Promise<ProductDto[]> {
    const products = await this.products.listActive();
    // VND prices only matter when bank transfers are available.
    return this.payos.enabled ? products : products.map((p) => ({ ...p, priceVnd: null }));
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

  @Post(":id/checkout")
  @ApiOperation({ summary: "A PayOS checkout page (VietQR bank transfer) for the VND price" })
  @ApiOkResponse({ standardSchema: checkoutSchema })
  @ApiNotFoundResponse({
    description: "Unknown or inactive product",
    standardSchema: errorResponseSchema,
  })
  async checkout(@Param("id") id: string, @AppUser() user: User): Promise<CheckoutDto> {
    const product = await this.products.getActive(id);
    if (!product.priceVnd) throw new BadRequestException("This product has no VND price");
    const checkout = await this.payos.createInvoice(
      {
        user,
        item: {
          productId: product.id,
          title: product.title,
          description: product.description,
          amount: product.priceVnd,
        },
      },
      { type: "checkout" },
    );
    if (checkout.type !== "checkout") throw new Error("Expected a checkout page");
    return {
      orderCode: checkout.orderCode,
      url: checkout.url,
      amount: checkout.amount,
      currency: checkout.currency,
      expiresAt: checkout.expiresAt.toISOString(),
    };
  }
}
