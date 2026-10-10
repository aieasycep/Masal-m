# Masalım admin paneli (Next.js) — sunucu imajı.
# Build context repo kökü: docker build -f deploy/admin.Dockerfile .
# NEXT_PUBLIC_API_URL derleme anında tarayıcı paketine gömülür — API'nin
# HERKESE AÇIK adresi olmalı (compose build args'tan gelir).
FROM node:22-slim

RUN corepack enable

WORKDIR /app
COPY --chown=node:node . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    CI=1 \
    HOME=/tmp/home \
    NEXT_TELEMETRY_DISABLED=1

# Build as root; the runtime user only needs read access plus the .next/cache
# directory (mounted as tmpfs by compose, pre-created here for local runs).
RUN pnpm install --frozen-lockfile \
  && pnpm turbo build --filter=@masalim/admin... \
  && mkdir -p apps/admin/.next/cache \
  && chown -R node:node apps/admin/.next \
  && test -x apps/admin/node_modules/.bin/next

USER node
WORKDIR /app/apps/admin

CMD ["sh", "-c", "mkdir -p \"$HOME\" && exec ./node_modules/.bin/next start -p 3000"]
