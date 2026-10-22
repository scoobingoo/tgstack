import { Global, Module } from "@nestjs/common";
import {
  PAYMENT_PROVIDERS,
  type PaymentProvider,
} from "./interfaces/payment-provider.interface.js";
import { PaymentOrdersController } from "./payment-orders.controller.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";
import { PaymentsUpdate } from "./payments.update.js";
import { PayOsWebhookController } from "./payos-webhook.controller.js";
import { PayOsProvider } from "./providers/payos/payos.provider.js";
import { TelegramStarsProvider } from "./providers/telegram-stars.provider.js";

/**
 * Payments core. Providers are listed in `PAYMENT_PROVIDERS`; add a gateway by
 * implementing `PaymentProvider` and appending it here (docs/payments.md).
 */
@Global()
@Module({
  controllers: [PaymentsController, PaymentOrdersController, PayOsWebhookController],
  providers: [
    TelegramStarsProvider,
    PayOsProvider,
    {
      provide: PAYMENT_PROVIDERS,
      inject: [TelegramStarsProvider, PayOsProvider],
      // PayOS joins the registry only when its credentials are set.
      useFactory: (stars: TelegramStarsProvider, payos: PayOsProvider): PaymentProvider[] =>
        payos.enabled ? [stars, payos] : [stars],
    },
    PaymentsService,
    PaymentsUpdate,
  ],
  exports: [PaymentsService, TelegramStarsProvider, PayOsProvider],
})
export class PaymentsModule {}
