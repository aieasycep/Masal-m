# Masalım 🌙

AI-personalized bedtime stories for children — parents create child profiles,
generate age-appropriate Turkish stories with AI, narrate them with system
voices or their **own cloned voice** (explicit consent required), illustrate
them with a consistent hero, build digital books and order printed copies.

Monorepo: **Expo (React Native) app · NestJS API · Next.js admin panel**,
PostgreSQL + Prisma, Redis + BullMQ, S3 storage, provider-abstracted AI —
everything runs locally against **complete mocks** with zero credentials.

## Quick start

```bash
corepack enable && pnpm install

cp .env.example .env                # defaults work for local dev (mock providers)
docker compose up -d                # postgres + redis + minio
pnpm db:migrate && pnpm db:seed

pnpm dev:api                        # NestJS on :3001 (Swagger at /docs)
pnpm dev:admin                      # Next.js admin on :3002
pnpm dev:mobile                     # Expo (dev client required for native modules)
```

Seeded logins — admin panel: `admin@masalim.local` / `admin-dev-password-1`;
demo app user: `demo@masalim.local` / `demo-password-1`.

The mobile app needs an **EAS dev client** (Apple/Google sign-in,
track-player, purchases and notifications are native modules — Expo Go won't
run them). Email/password auth + every feature works against mocks:
story generation returns a deterministic Turkish story, TTS renders playable
audio, image generation renders style-tinted art, payments auto-succeed and
the mock print provider progresses orders to SHIPPED.

## Workspace

```
apps/mobile     Expo SDK 57 + Expo Router — the parent-facing app
apps/api        NestJS 11 — REST API + BullMQ workers (inline by default)
apps/admin      Next.js 15 — internal admin panel (RBAC)
packages/*      types · validation (zod) · database (prisma) · ai · storage ·
                payments · notifications · api-client · localization · ui · config
docs/           architecture.md · providers.md · database.md · design-reference/
```

## Commands

| Command | What |
|---|---|
| `pnpm dev` / `dev:api` / `dev:admin` / `dev:mobile` | Run everything / one app |
| `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test` | Turbo across the workspace |
| `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:studio` | Prisma workflows |
| `pnpm i18n:check` | tr/en locale key parity (CI-enforced) |

## Configuration

All configuration is environment-driven — see **`.env.example`** (annotated).
Every external service is provider-abstracted (`AI_PROVIDER`, `TTS_PROVIDER`,
`PAYMENT_PROVIDER`, …) with `mock` defaults; production boot **refuses mock
providers**. Details and real-adapter setup: [docs/providers.md](docs/providers.md).

Recommended production stack: Anthropic (stories), ElevenLabs (TTS + voice
clone), OpenAI gpt-image-1 (illustrations), iyzico (payments), RevenueCat
(IAP), S3/R2 (storage), Expo Push. Print provider is an open interface —
no Turkish print API is integrated yet (mock ships the full order lifecycle).

## Architecture highlights

- **Two-phase story creation**: draft from the wizard, then an idempotent
  generate job with real SSE progress; moderation gates before and after.
- **Server-side truth**: prices, quotas and entitlements are computed and
  enforced in the API; clients only render them.
- **Consent-first voice cloning**: premium gate before recording, blocking
  consent checkbox stamped server-side, raw-recording retention policy,
  provider-side deletion on remove.
- **Character-consistent illustrations**: character-sheet-first pipeline with
  a verbatim CharacterBible in every image call.
- **Print-ready PDFs**: Chromium renders 206mm (200+3mm bleed) pages with
  images pre-sized to true 300 DPI.
- **Immutable order snapshots**: production assets copied to `orders/{id}/`
  before print handoff; user deletion never touches them.

More: [docs/architecture.md](docs/architecture.md) ·
[docs/database.md](docs/database.md)

## Deployment

- **API + workers**: Docker (needs ffmpeg + Chromium in the image, or set
  `FFMPEG_PATH`/`CHROMIUM_PATH`); scale workers separately with
  `WORKER_MODE=separate`.
- **Postgres/Redis**: managed services; run `prisma migrate deploy` on release.
- **Admin**: any Node host / Vercel (`NEXT_PUBLIC_API_URL`).
- **Mobile**: EAS Build (development/staging/production profiles); push needs
  an Expo access token, IAP needs RevenueCat keys.
