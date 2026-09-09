# Example modules

tgstack ships a few example features so the template does something useful out of the box. They are marked with `// EXAMPLE:` comments and can be removed without touching the core.

| Example | Where | Remove it |
|---|---|---|
| Shop: products sold for Telegram Stars | `apps/server/src/examples/shop`, `packages/shared/src/schemas/products.ts` | Delete the folder and the `ShopModule` import in `apps/server/src/app.module.ts`. Payments keep working for other products (`Payment.productId` is optional). Later phases add the Mini App shop page and the `/buy` command to this list. |
| Onboarding wizard (conversations plugin) | `apps/server/src/examples/onboarding` | Delete the folder and the `OnboardingModule` import in `apps/server/src/app.module.ts`. Remove the `onboarding-*` and `command-onboarding` keys from `packages/i18n/locales/*/bot.ftl`. Optionally drop the `User.onboarding` column with a migration. |

After removing an example run `pnpm lint && pnpm typecheck && pnpm test`.
