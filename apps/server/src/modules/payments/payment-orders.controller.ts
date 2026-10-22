import { Get, NotFoundException, Param, ParseIntPipe } from "@nestjs/common";
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import type { User } from "@tgstack/db";
import { errorResponseSchema, type PaymentOrderDto, paymentOrderSchema } from "@tgstack/shared";
import { AppUser } from "../../common/decorators/app-user.decorator.js";
import { MiniAppController } from "../../common/decorators/mini-app-controller.decorator.js";
import { PrismaService } from "../../infra/prisma/prisma.service.js";

/** `/api/app/payment-orders/:orderCode`: the Mini App polls it while the buyer pays by bank transfer. */
@MiniAppController("payment-orders", "mini app: payments")
export class PaymentOrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":orderCode")
  @ApiOperation({ summary: "Status of one of your bank-transfer checkouts" })
  @ApiOkResponse({ standardSchema: paymentOrderSchema })
  @ApiNotFoundResponse({ standardSchema: errorResponseSchema })
  async get(
    @Param("orderCode", ParseIntPipe) orderCode: number,
    @AppUser() user: User,
  ): Promise<PaymentOrderDto> {
    // Other users' orders are reported as missing, not forbidden.
    const where = { orderCode, userId: user.id };
    // Expire lazily; the condition keeps a webhook that just marked it PAID safe.
    await this.prisma.paymentOrder.updateMany({
      where: { ...where, status: "PENDING", expiresAt: { lt: new Date() } },
      data: { status: "EXPIRED" },
    });
    const order = await this.prisma.paymentOrder.findFirst({ where });
    if (!order) throw new NotFoundException("Order not found");
    return {
      orderCode: order.orderCode,
      status: order.status,
      amount: order.amount,
      currency: order.currency,
      expiresAt: order.expiresAt.toISOString(),
      paidAt: order.paidAt?.toISOString() ?? null,
    };
  }
}
