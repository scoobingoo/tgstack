# syntax=docker/dockerfile:1.7
# Mini App: static files served by Caddy.

ARG NODE_VERSION=24
ARG PNPM_VERSION=12.14.0

FROM node:${NODE_VERSION}-alpine AS build
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force
ENV TURBO_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --trust-lockfile --store-dir /pnpm/store
# Base path behind the reverse proxy (docker-compose.prod.yml serves it under /app/).
ARG MINIAPP_BASE_PATH=/app/
# Leave empty when the API is on the same domain.
ARG VITE_API_URL=
ENV MINIAPP_BASE_PATH=${MINIAPP_BASE_PATH} VITE_API_URL=${VITE_API_URL}
RUN pnpm exec turbo run build --filter=@tgstack/miniapp...

FROM caddy:2-alpine AS runtime
COPY docker/miniapp.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/miniapp/dist /srv
EXPOSE 80
