# Example modules

tgstack ships a few example features so the template does something useful out of the box. They are marked with `// EXAMPLE:` comments and can be removed without touching the core.

| Example | Where | Remove it |
|---|---|---|
| Onboarding wizard (conversations plugin) | `apps/server/src/examples/onboarding` | Delete the folder and the `OnboardingModule` import in `apps/server/src/app.module.ts`. Remove the `onboarding-*` and `command-onboarding` keys from `packages/i18n/locales/*/bot.ftl`. Optionally drop the `User.onboarding` column with a migration. |

The list grows as later phases add the shop (products + Telegram Stars) example.

After removing an example run `pnpm lint && pnpm typecheck && pnpm test`.
