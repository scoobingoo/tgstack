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
- **Pre-checkout** (`payments.update.ts`) must be answered within 10 seconds, so it only does indexed lookups: the signature, that the payer is the user in the payload, that the product is still active and that the price did not change. Rejections show a localized reason in Telegram. Any unexpected error still answers `ok: false`.
- **Successful payment** is idempotent: `telegram_payment_charge_id` is unique and the insert uses `skipDuplicates`, so a re-delivered update never creates a second payment or a second thank-you message. The handlers run **before** the conversations plugin, so an open wizard cannot swallow a payment.
- **Refunds** — dashboard → Payments → Refund (`POST /api/admin/payments/:id/refund`) calls `refundStarPayment` and marks the payment `REFUNDED`. Telegram errors are shown to the admin (`502`) and the payment stays `PAID`.

Revenue on the dashboard is the sum of `PAID` Stars payments.

## Testing a payment by hand

Automated tests mock the Bot API. To see the real thing:

1. **Telegram test environment (free).** Log in to a test account ([how](https://core.telegram.org/bots/webapps#using-bots-in-the-test-environment)), create a bot with the test @BotFather, and set `BOT_TOKEN=<test bot token>` and `BOT_TEST_ENVIRONMENT=true`: every Bot API call (bot and worker) then goes to the test servers and payments do not cost real Stars. The test environment also accepts plain HTTP Mini App URLs.
2. **Production with a tiny amount.** Create a 1 ⭐ product in the dashboard, buy it from your own account (`/buy` or the Mini App), check that the payment appears in the dashboard and in the bot's thank-you message, then refund it from the dashboard — the Star returns to your balance.

Check, in order: the invoice opens; the bot logs `Payment … 1 XTR from …`; the payment shows up under Payments; a refund flips it to *Refunded*.

## Bank transfers in Vietnam (PayOS / VietQR)

[PayOS](https://payos.vn) turns a bank transfer into a checkout: it shows a **VietQR** code that any Vietnamese banking app can scan, and calls a webhook when the money arrives. tgstack ships it as the second provider (`modules/payments/providers/payos/`), off until you set its credentials.

> Telegram requires **Stars** for digital goods and services sold inside Telegram. Use bank transfers for what that rule does not cover, such as physical goods, services delivered outside Telegram and donations, and check Telegram's terms for your case.

### Flow

```
Mini App "Pay by bank transfer" ──▶ POST /api/app/products/:id/checkout
                                     PaymentOrder (PENDING) + PayOS payment link (signed)
"Open the payment page" ──openLink──▶ pay.payos.vn: VietQR code, buyer pays in the banking app
                                     PayOS ──▶ POST /api/webhooks/payos (HMAC-SHA256 signature)
                                     PaymentOrder PAID + Payment (provider "payos", VND), once
bot: "Thank you! We received … ₫" ◀─── PayOS redirects the browser back to the bot's chat
Mini App polls GET /api/app/payment-orders/:orderCode ──▶ PAID
```

- **Orders.** `PaymentOrder` tracks the checkout before it is paid: a random `orderCode` (PayOS order number), amount, buyer, product, status `PENDING → PAID` (or `EXPIRED` after `PAYOS_ORDER_TTL_MINUTES`, default 15, or `CANCELLED` when PayOS refused the link). The transfer description is `TG<order in base 36>`, within PayOS' 9-character limit for unlinked bank accounts.
- **Webhook.** `POST /api/webhooks/payos` is public, like the Telegram webhook, and authenticated by the signature of its `data` (sorted `key=value` pairs, HMAC-SHA256 with the checksum key, constant-time comparison). Invalid signatures get `400`. A correctly signed call for an unknown order, such as the sample PayOS sends when you register the URL, or with a different amount, gets `200 { result: "ignored" }` and changes nothing. Repeated deliveries record the payment once (`Payment.telegramPaymentChargeId` is `payos:<orderCode>`; the column name predates other providers). A transfer that arrives after the order expired is still recorded, because the money arrived.
- **Refunds.** PayOS has no refund API. Payments from providers with `refundMode: "manual"` show **Mark as refunded** in the dashboard: transfer the money back from your bank first, then mark it. Nothing is sent to PayOS.
- **Revenue.** The dashboard shows bank-transfer revenue (VND) next to Stars.
- **Prices.** Products get an optional `priceVnd`. The Mini App offers a bank transfer only for products that have one, and only while PayOS is configured.

### Setup

1. Create a payment channel on [my.payos.vn](https://my.payos.vn) and link your bank account.
2. Copy the channel's **Client ID**, **API Key** and **Checksum Key** to `.env`: `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` (all three, or none).
3. Set the webhook URL of the channel to `https://<your domain>/api/webhooks/payos`, in the PayOS dashboard or with the API (PayOS sends a signed test payload; tgstack answers `200`):

   ```bash
   curl -X POST https://api-merchant.payos.vn/confirm-webhook \
     -H "x-client-id: $PAYOS_CLIENT_ID" -H "x-api-key: $PAYOS_API_KEY" \
     -H "content-type: application/json" \
     -d '{"webhookUrl":"https://your.domain/api/webhooks/payos"}'
   ```

4. Give a product a price in đồng in the dashboard (Products → edit).

Optional: `PAYOS_RETURN_URL` (where the browser goes after paying or cancelling; default `https://t.me/<your bot>`), `PAYOS_ORDER_TTL_MINUTES`.

### Testing it

PayOS has **no sandbox**: its docs recommend testing in production with small amounts. The automated tests (`apps/server/test/payos.e2e.spec.ts`) run against a local stand-in for the PayOS API (`PAYOS_API_URL`) and check the signature algorithm against the example in the PayOS docs. By hand: price a product at a few thousand đồng, pay it from your own account, and check that the Mini App switches to "received", the bot thanks you and the payment appears under Payments.

## Adding a provider

1. Implement `PaymentProvider` (`apps/server/src/modules/payments/interfaces/payment-provider.interface.ts`):

   ```ts
   @Injectable()
   export class MyGatewayProvider implements PaymentProvider {
     readonly name = "my-gateway";
     readonly currency = "USD";
     readonly refundMode = "automatic"; // or "manual" when the gateway has no refund API
     createInvoice(request, target) { /* target.type "checkout": create a hosted checkout */ }
     handlePreCheckout(request) { /* only for Telegram-native invoices */ }
     handleSuccess(request) { /* called from your webhook; insert idempotently by the gateway's charge id */ }
     refund(payment) { /* call the gateway's refund API */ }
   }
   ```

2. Put it in `modules/payments/providers/` and register it in `PaymentsModule`: add the class to `providers` and to the `PAYMENT_PROVIDERS` factory.
3. Expose the gateway's webhook under `/api/webhooks/<gateway>` (see `payos-webhook.controller.ts`): verify the gateway's signature before anything else, then call `handleSuccess`. PayOS is the complete example.
4. `PaymentsService.getProvider(name)` and the admin refund endpoint work unchanged: refunds are routed by `Payment.provider`.

The test `PaymentProvider registry` in `apps/server/test/payments.e2e.spec.ts` shows a second (fake) provider wired next to Telegram Stars.
