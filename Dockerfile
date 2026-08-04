FROM node:22-alpine AS build
WORKDIR /app

# This repository is managed by pnpm (see `packageManager` in package.json).
# npm cannot install this dependency graph: it builds a flat node_modules and
# cannot simultaneously satisfy @nuxt/ui's @tiptap/* tree and the root
# project's, which pnpm resolves correctly via its isolated store.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

# Dependency manifests only, so this layer caches independently of source changes.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# A cold Nuxt build exceeds Node's default heap (~2 GB on common build hosts).
# Build stage only -- the runtime stage is a separate FROM and has shown no
# heap pressure, so it deliberately inherits nothing from here.
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN pnpm run build

FROM node:22-alpine
RUN apk add --no-cache git ca-certificates
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
