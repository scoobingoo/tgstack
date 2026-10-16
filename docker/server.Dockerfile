# syntax=docker/dockerfile:1.7
# One image for the API + bot and the queue worker (decision D2):
#   node dist/main.js          API + bot (default command)
#   node dist/main.worker.js   broadcast worker
# The `migrate` target is a small image with the Prisma CLI: `prisma migrate deploy`
# (default command) and `prisma db seed`.

ARG NODE_VERSION=24
ARG PNPM_VERSION=12.14.0

FROM node:${NODE_VERSION}-alpine AS build
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force
ENV TURBO_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY . .
# The lockfile is frozen and was verified against the supply-chain policy when it was committed.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --trust-lockfile --store-dir /pnpm/store
RUN pnpm exec turbo run build --filter=@tgstack/server...
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @tgstack/server deploy --prod --trust-lockfile --store-dir /pnpm/store /out/server \
 && pnpm --filter @tgstack/db deploy --trust-lockfile --store-dir /pnpm/store /out/db \
 && cp -r packages/db/prisma packages/db/prisma.config.ts packages/db/src /out/db/
# pnpm installs peer dependencies too (Prisma CLI, engines, Studio): keep only what runs.
RUN node docker/prune-node-modules.mjs /out/server

FROM node:${NODE_VERSION}-alpine AS migrate
RUN apk add --no-cache openssl
ENV NODE_ENV=production PATH=/db/node_modules/.bin:$PATH
WORKDIR /db
COPY --from=build --chown=node:node /out/db ./
USER node
CMD ["prisma", "migrate", "deploy"]

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/server ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
