import { Global, Module } from "@nestjs/common";
import {
  PAYMENT_PROVIDERS,
  type PaymentProvider,
} from "./interfaces/payment-provider.interface.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";
import { PaymentsUpdate } from "./payments.update.js";
import { TelegramStarsProvider } from "./providers/telegram-stars.provider.js";

/**
 * Payments core. Providers are listed in `PAYMENT_PROVIDERS`; add a gateway by
 * implementing `PaymentProvider` and appending it here (docs/payments.md).
 */
@Global()
@Module({
  controllers: [PaymentsController],
  providers: [
    TelegramStarsProvider,
    {
      provide: PAYMENT_PROVIDERS,
      inject: [TelegramStarsProvider],
      useFactory: (...providers: PaymentProvider[]) => providers,
    },
    PaymentsService,
    PaymentsUpdate,
  ],
  exports: [PaymentsService, TelegramStarsProvider],
})
export class PaymentsModule {}
