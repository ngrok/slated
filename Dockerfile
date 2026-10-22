# syntax=docker/dockerfile:1

# Base image with pnpm enabled via corepack (version pinned by package.json's
# "packageManager" field).
# 22.23.4 updates Node's bundled CA roots, removing the distrusted emSign G3 root.
FROM node:22.23.4-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Full install (incl. dev deps) for building.
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Production build -> /app/build (server + client).
FROM deps AS build
COPY . .
RUN pnpm build

# Production-only dependencies for the runtime image.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Minimal runtime image.
FROM base AS runtime
ENV NODE_ENV=production
# react-router-serve listens on $PORT (default 3000). LINEAR_API_KEY is provided
# at runtime via the environment, not baked into the image.
ENV PORT=3000
EXPOSE 3000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
CMD ["pnpm", "start"]
