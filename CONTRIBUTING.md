# Contributing to tgstack

Thanks for helping. Bug reports, documentation fixes, translations and code are all welcome.

## Before you start

- **Bugs**: open an issue with the bug template: what you did, what you expected, what happened, versions.
- **Features**: open an issue first and describe the use case. tgstack is a starter, so features that most Telegram products need fit better than very specific ones; larger ideas go to [docs/backlog.md](./docs/backlog.md).
- **First contribution?** Pick something from [Good first issues](./docs/backlog.md#good-first-issues) and say in the issue that you are on it.
- **Security issues**: do not open a public issue. Use GitHub's *Report a vulnerability* (Security tab) so it can be fixed before it is disclosed.

## Development setup

Follow [docs/development.md](./docs/development.md): Node.js 24, pnpm 12, Docker for Postgres and Redis. `pnpm --filter @tgstack/server dev:mock` runs the server without a bot token.

Read [docs/architecture.md](./docs/architecture.md) before moving code around: it says which package may import which, where a new feature goes (`apps/server/src/modules/<feature>`), and the order of the bot middleware. `apps/server/test/architecture.spec.ts` checks most of it.

## Pull requests

1. Branch from `main`. Keep a pull request to one change.
2. Run the same checks as CI:

   ```bash
   pnpm lint && pnpm typecheck && pnpm test
   ```

   Integration tests need `pnpm infra:up`. They never call the real Telegram API; use `MockBotApi` from `@tgstack/nestjs-grammy/testing` in new tests.
3. Use [Conventional Commits](https://www.conventionalcommits.org) for commit messages and the PR title: `feat(bot): …`, `fix(admin): …`, `docs: …`.
4. Update the docs in the same PR when behaviour changes. Record a non-obvious design choice in [docs/decisions.md](./docs/decisions.md).
5. Changes to `@tgstack/nestjs-grammy` need a changeset: `pnpm changeset`.

## Conventions

- TypeScript strict, ESM, `.js` extensions in relative imports. Biome formats and lints (`pnpm lint:fix`).
- Validate every input with a zod schema from `@tgstack/shared`; map Prisma rows to DTOs explicitly.
- Every user-facing string goes through `@tgstack/i18n`, in **every** locale (a test fails otherwise). Escape user values in HTML messages with `escapeHtml()`.
- Showcase code is marked `// EXAMPLE:` and must stay removable.
- Never commit secrets: only `.env.example` files are tracked.

## Code of Conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md). By participating you agree to uphold it.

## License

By contributing you agree that your contributions are licensed under the [MIT License](./LICENSE).
