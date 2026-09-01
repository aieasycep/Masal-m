# Masalım admin paneli (Next.js) — sunucu imajı.
# Build context repo kökü: docker build -f deploy/admin.Dockerfile .
# NEXT_PUBLIC_API_URL derleme anında tarayıcı paketine gömülür — API'nin
# HERKESE AÇIK adresi olmalı (compose build args'tan gelir).
FROM node:22-slim

RUN corepack enable

WORKDIR /app
COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    CI=1

RUN pnpm install --frozen-lockfile \
  && pnpm turbo build --filter=@masalim/admin...

CMD ["pnpm", "--filter", "@masalim/admin", "exec", "next", "start", "-p", "3000"]
