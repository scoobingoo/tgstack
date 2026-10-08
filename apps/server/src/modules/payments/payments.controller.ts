import { Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  ApiBadGatewayResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
} from "@nestjs/swagger";
import {
  errorResponseSchema,
  type ListPaymentsQuery,
  listPaymentsQuerySchema,
  type Paginated,
  type PaymentDto,
  paginatedSchema,
  paymentSchema,
} from "@tgstack/shared";
import { AdminController } from "../common/admin-controller.decorator.js";
import { PaymentsService } from "./payments.service.js";

@AdminController("payments", "admin: payments")
export class PaymentsAdminController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: "List payments, newest first" })
  @ApiOkResponse({ standardSchema: paginatedSchema(paymentSchema) })
  list(
    @Query({ schema: listPaymentsQuerySchema }) query: ListPaymentsQuery,
  ): Promise<Paginated<PaymentDto>> {
    return this.payments.list(query);
  }

  @Post(":id/refund")
  @HttpCode(200)
  @ApiOperation({ summary: "Refund a payment through its provider (Stars: refundStarPayment)" })
  @ApiOkResponse({ standardSchema: paymentSchema })
  @ApiNotFoundResponse({ standardSchema: errorResponseSchema })
  @ApiConflictResponse({ description: "Already refunded", standardSchema: errorResponseSchema })
  @ApiBadGatewayResponse({
    description: "The provider refused the refund",
    standardSchema: errorResponseSchema,
  })
  refund(@Param("id") id: string): Promise<PaymentDto> {
    return this.payments.refund(id);
  }
}
