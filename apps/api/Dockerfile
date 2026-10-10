# Masalım API — production/test image (API + inline BullMQ workers).
# Build context is the REPO ROOT (monorepo): docker build -f apps/api/Dockerfile .
FROM node:22-slim

# ffmpeg (narration concat) + chromium (print PDF worker)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg chromium ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

# HOME lives under /tmp: the container runs with a read-only root filesystem
# and only /tmp is writable (tmpfs) — Chromium, ffmpeg and the narration
# pipeline keep their scratch files there.
ENV FFMPEG_PATH=/usr/bin/ffmpeg \
    CHROMIUM_PATH=/usr/bin/chromium \
    CI=1 \
    HOME=/tmp/home \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

RUN corepack enable

WORKDIR /app
COPY --chown=node:node . .

# Build as root (pnpm store + turbo cache), then verify the two CLIs the boot
# command needs are present as plain node shims — the runtime user has no pnpm.
RUN pnpm install --frozen-lockfile \
  && pnpm turbo build --filter=@masalim/api... \
  && test -x packages/database/node_modules/.bin/prisma \
  && test -x packages/database/node_modules/.bin/tsx

# Unprivileged runtime user (uid 1000, ships with the base image).
USER node

# Migrations + idempotent seed on boot, then the API (workers run inline).
# `exec` makes node PID 1 so SIGTERM reaches Nest's shutdown hooks and the
# BullMQ workers can finish their in-flight (paid) jobs before a redeploy.
CMD ["sh", "-c", "mkdir -p \"$HOME\" && cd packages/database && ./node_modules/.bin/prisma migrate deploy && ./node_modules/.bin/tsx prisma/seed.ts && cd /app && exec node apps/api/dist/main.js"]
