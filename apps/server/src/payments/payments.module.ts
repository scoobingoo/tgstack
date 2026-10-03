import { Global, Module } from "@nestjs/common";
import { PAYMENT_PROVIDERS, type PaymentProvider } from "./payment-provider.js";
import { PaymentsService } from "./payments.service.js";
import { PaymentsAdminController } from "./payments-admin.controller.js";
import { PaymentsBotHandlers } from "./payments-bot.handlers.js";
import { TelegramStarsProvider } from "./telegram-stars.provider.js";

/**
 * Payments core. Providers are listed in `PAYMENT_PROVIDERS`; add a gateway by
 * implementing `PaymentProvider` and appending it here (docs/payments.md).
 */
@Global()
@Module({
  controllers: [PaymentsAdminController],
  providers: [
    TelegramStarsProvider,
    {
      provide: PAYMENT_PROVIDERS,
      inject: [TelegramStarsProvider],
      useFactory: (...providers: PaymentProvider[]) => providers,
    },
    PaymentsService,
    PaymentsBotHandlers,
  ],
  exports: [PaymentsService, TelegramStarsProvider],
})
export class PaymentsModule {}
