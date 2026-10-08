# syntax=docker/dockerfile:1.7
# Admin dashboard: Next.js standalone output.

ARG NODE_VERSION=24
ARG PNPM_VERSION=12.14.0

FROM node:${NODE_VERSION}-alpine AS build
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force
ENV TURBO_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --trust-lockfile --store-dir /pnpm/store
# Inlined at build time. NEXT_PUBLIC_API_URL is where /api/* is proxied when the
# reverse proxy does not route it first (it does in docker-compose.prod.yml).
ARG NEXT_PUBLIC_API_URL=http://server:3000
ARG NEXT_PUBLIC_BOT_USERNAME=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} NEXT_PUBLIC_BOT_USERNAME=${NEXT_PUBLIC_BOT_USERNAME}
RUN pnpm exec turbo run build --filter=@tgstack/admin...

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/admin/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/admin/.next/static ./apps/admin/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/admin/server.js"]
