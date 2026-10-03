# Payments (Telegram Stars)

Digital goods sold inside Telegram must be paid in **Telegram Stars** (currency `XTR`). tgstack implements the full flow — invoice → pre-checkout → successful payment → refund — behind a provider interface, so other gateways can be added later.

## Flow

```
Mini App / bot          server                                   Telegram
──────────────          ──────                                   ────────
"Buy" ───────────────▶ createInvoiceLink / sendInvoice ────────▶ invoice (XTR, provider_token "")
                        payload = v1.<product>.<user>.<nonce>.<HMAC>
user pays ◀──────────────────────────────────────────────────── payment sheet
                        pre_checkout_query ◀─────────────────── "can I charge?"
                        verify payload, user, product, price
                        answerPreCheckoutQuery(ok) ───────────▶ (within 10 s)
                        successful_payment ◀─────────────────── charged
                        INSERT … ON CONFLICT DO NOTHING (charge id)
thank-you message ◀──── reply
admin "Refund" ───────▶ refundStarPayment ─────────────────────▶ Stars back to the user
                        status = REFUNDED
```

- **Invoices.** The Mini App calls `POST /api/app/products/:id/invoice` and opens the link with `openInvoice()`; the bot's `/buy` (EXAMPLE) sends an invoice message with `sendInvoice`. Both use `TelegramStarsProvider.createInvoice()`: currency `XTR`, empty provider token, one price line, title ≤ 32 and description ≤ 255 characters.
- **Payload.** At most 128 bytes, opaque and signed: `v1.<productId>.<userId>.<nonce>.<signature>` with a truncated HMAC-SHA-256 keyed by `JWT_SECRET` (`invoice-payload.ts`). It cannot be forged or replayed for another user.
- **Pre-checkout** (`payments-bot.handlers.ts`) must be answered within 10 seconds, so it only does indexed lookups: the signature, that the payer is the user in the payload, that the product is still active and that the price did not change. Rejections show a localized reason in Telegram. Any unexpected error still answers `ok: false`.
- **Successful payment** is idempotent: `telegram_payment_charge_id` is unique and the insert uses `skipDuplicates`, so a re-delivered update never creates a second payment or a second thank-you message. The handlers run **before** the conversations plugin, so an open wizard cannot swallow a payment.
- **Refunds** — dashboard → Payments → Refund (`POST /api/admin/payments/:id/refund`) calls `refundStarPayment` and marks the payment `REFUNDED`. Telegram errors are shown to the admin (`502`) and the payment stays `PAID`.

Revenue on the dashboard is the sum of `PAID` Stars payments.

## Testing a payment by hand

Automated tests mock the Bot API. To see the real thing:

1. **Telegram test environment (free).** Log in to a test account ([how](https://core.telegram.org/bots/webapps#using-bots-in-the-test-environment)), create a bot with the test @BotFather, and set `BOT_TOKEN=<test bot token>` and `BOT_TEST_ENVIRONMENT=true`: every Bot API call (bot and worker) then goes to the test servers and payments do not cost real Stars. The test environment also accepts plain HTTP Mini App URLs.
2. **Production with a tiny amount.** Create a 1 ⭐ product in the dashboard, buy it from your own account (`/buy` or the Mini App), check that the payment appears in the dashboard and in the bot's thank-you message, then refund it from the dashboard — the Star returns to your balance.

Check, in order: the invoice opens; the bot logs `Payment … 1 XTR from …`; the payment shows up under Payments; a refund flips it to *Refunded*.

## Adding a provider (VietQR, PayOS, …)

1. Implement `PaymentProvider` (`apps/server/src/payments/payment-provider.ts`):

   ```ts
   @Injectable()
   export class PayOsProvider implements PaymentProvider {
     readonly name = "payos";
     readonly currency = "VND";
     createInvoice(request, target) { /* create a checkout link with the gateway */ }
     handlePreCheckout(request) { /* only for Telegram-native invoices; otherwise return { ok: true } */ }
     handleSuccess(request) { /* called from your webhook; insert idempotently by the gateway's charge id */ }
     refund(payment) { /* call the gateway's refund API */ }
   }
   ```

2. Register it in `PaymentsModule`: add the class to `providers` and to the `inject` list of `PAYMENT_PROVIDERS`.
3. Expose the gateway's webhook (a normal controller) that verifies the gateway's signature and calls `handleSuccess`.
4. `PaymentsService.getProvider(name)` and the admin refund endpoint work unchanged: refunds are routed by `Payment.provider`.

The test `PaymentProvider registry` in `apps/server/test/payments.e2e.spec.ts` shows a second (fake) provider wired next to Telegram Stars.
