# Example modules

tgstack ships a few example features so the template does something useful out of the box. They are marked with `// EXAMPLE:` comments and can be removed without touching the core.

| Example | Where | Remove it |
|---|---|---|
| Shop: products sold for Telegram Stars | Server: `apps/server/src/examples/shop`. Mini App: `apps/miniapp/src/examples/shop` + its tab in `src/App.tsx`. Admin: `apps/admin/src/app/(dashboard)/products` + its sidebar entry. Schemas: `packages/shared/src/schemas/products.ts`, `invoiceLinkSchema`. | Delete those folders and the references (`ShopModule` import in `app.module.ts`, the Mini App tab, the sidebar entry). Payments keep working for other products (`Payment.productId` is optional). |
| Onboarding wizard (conversations plugin) | `apps/server/src/examples/onboarding` | Delete the folder and the `OnboardingModule` import in `apps/server/src/app.module.ts`. Remove the `onboarding-*` and `command-onboarding` keys from `packages/i18n/locales/*/bot.ftl`. Optionally drop the `User.onboarding` column with a migration. |

After removing an example run `pnpm lint && pnpm typecheck && pnpm test`.
