# Changesets

Versioning for the publishable package `@tgstack/nestjs-grammy` (the apps and the other packages are private and never published).

When a pull request changes `packages/nestjs-grammy`, add a changeset describing it for users:

```bash
pnpm changeset
```

On `main`, the publish workflow opens a "Version packages" pull request that bumps the version and updates `CHANGELOG.md`; merging it publishes to npm with provenance.
