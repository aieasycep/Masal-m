# Masalım API — production/test image (API + inline BullMQ workers).
# Build context is the REPO ROOT (monorepo): docker build -f apps/api/Dockerfile .
FROM node:22-slim

# ffmpeg (narration concat) + chromium (print PDF worker)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg chromium ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

ENV FFMPEG_PATH=/usr/bin/ffmpeg \
    CHROMIUM_PATH=/usr/bin/chromium \
    CI=1

RUN corepack enable

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm turbo build --filter=@masalim/api...

# Migrations + idempotent seed on boot, then the API (workers run inline).
CMD ["sh", "-c", "pnpm --filter @masalim/database db:migrate:deploy && pnpm --filter @masalim/database db:seed && node apps/api/dist/main.js"]
