import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { errorResponseSchema } from "@tgstack/shared";
import { z } from "zod";
import { PayOsProvider } from "./providers/payos/payos.provider.js";

/**
 * `POST /api/webhooks/payos`: payment notifications from PayOS. Public, like the
 * Telegram webhook, and authenticated by the HMAC signature of the body instead.
 * Any 2xx tells PayOS the delivery succeeded.
 */
@ApiTags("webhooks")
@Controller("webhooks/payos")
export class PayOsWebhookController {
  constructor(private readonly payos: PayOsProvider) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: "PayOS payment webhook (signature-verified)" })
  @ApiOkResponse({
    standardSchema: z.object({ result: z.enum(["recorded", "duplicate", "ignored"]) }),
  })
  @ApiBadRequestResponse({ description: "Invalid signature", standardSchema: errorResponseSchema })
  async receive(@Body() body: unknown): Promise<{ result: string }> {
    return { result: await this.payos.handleWebhook(body) };
  }
}
