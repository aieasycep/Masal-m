# Masalım — Project State & Conventions (Claude working memory)

AI-personalized children's story app (Turkish market). Full-stack monorepo MVP built
from a 104-section master prompt. **The approved implementation plan lives at
`/root/.claude/plans/root-claude-uploads-d30e442f-987f-59e9-polymorphic-beacon.md`** —
consult it for architecture details. Design source of truth: `docs/design-reference/`
(Figma Make export — every screen's .tsx is the pixel spec + `masalim-app-design.md` brief).

## Structure

- `apps/api` — NestJS 11. Modules under `src/modules/*`; providers DI in `src/providers`
  (STORAGE, PUSH tokens + MailService); env in `src/config/env.ts` (Zod-validated,
  **production refuses mock providers**); global JwtAuthGuard (+`@Public()`),
  ZodValidationPipe (nestjs-zod `createZodDto`), GlobalExceptionFilter →
  `{error:{code,message,requestId}}` with `ErrorCode` from `@masalim/types`.
- `apps/mobile` — Expo SDK 57 / RN 0.86 / React 19.2, Expo Router (typed routes).
  Tokens from `@masalim/ui`; i18n via `@masalim/localization` (ALL copy — no hardcoded
  user strings); TanStack Query (+AsyncStorage persist), Zustand stores in `src/stores`;
  SecureStore token store wired to `@masalim/api-client` (single-flight refresh).
  Native surface FROZEN in package.json (track-player, purchases, apple-auth,
  google-signin, notifications, expo-audio, dev-client) — avoid adding native deps later.
- `apps/admin` — Next.js (NOT YET CREATED — Phase 7).
- `packages/` — config (eslint/tsconfig presets), types (enums+ErrorCode+entitlements —
  mirrored in prisma schema, drift-guard test in database pkg), validation (Zod wire
  contracts, incl. `generatedStorySchema` LLM output), database (Prisma 6, 29 models,
  seed), localization (tr/en + `withSuffix` Turkish vowel harmony + parity script),
  ui (design tokens from Figma: colors/night/spacing/typography/radius/shadows/gradients),
  ai (story: Anthropic `messages.parse`+zodOutputFormat [needs zod/v4 mirror schema],
  OpenAI JSON+repair, mock; moderation LLM+blocklist; TTS ElevenLabs+WAV-melody mock;
  voice-clone ElevenLabs IVC+mock; image OpenAI character-sheet-first + sharp SVG mock),
  storage (S3/MinIO + local-disk dev provider + `StorageKeys` layout), payments (iyzico
  CF adapter + mock [amount ending .13 = fail]; PrintProvider mock with staged progress),
  notifications (Expo push + `PushRoutes` deep-link contract), api-client, analytics.

## Commands

`pnpm dev:api|dev:mobile`, `pnpm build|lint|typecheck|test`, `pnpm db:migrate|db:seed`,
`pnpm i18n:check`. API tests: jest (`pnpm --filter @masalim/api test`); packages: vitest.
Infra: `docker compose up -d` (postgres/redis/minio). Seed users:
`demo@masalim.local`/`demo-password-1`, admin `admin@masalim.local`/`admin-dev-password-1`.
Local `.env` = `.env.example` + generated JWT secrets (already present, gitignored).

## Environment quirks (this dev container)

- **dockerd**: must be started manually WITH proxy env:
  `sudo env "HTTPS_PROXY=$HTTPS_PROXY" "HTTP_PROXY=$HTTP_PROXY" "NO_PROXY=localhost,127.0.0.1" nohup dockerd &`
  and `/etc/docker/daemon.json` has `{"registry-mirrors":["https://mirror.gcr.io"]}`
  (Docker Hub anonymous pulls hit 429).
- **`npx expo install` DOES NOT WORK** (api.expo.dev blocked by proxy). Resolve versions
  from `node_modules/expo/bundledNativeModules.json` and `pnpm add` manually.
- **git push initially 403** — fixed by calling MCP `add_repo` with `access: "push"`
  for `aieasycep/masal-m`; then normal `git push -u origin <branch>` works. Branch:
  `claude/masalim-implementation-plan-pz1pkl`. If a PR exists already, don't recreate.
- pnpm 10 blocks postinstall scripts: approved list in root package.json
  `pnpm.onlyBuiltDependencies`.
- API smoke test pattern: `set -a && source .env && set +a && node apps/api/dist/main.js`.

## Conventions & decisions

- Zod pinned ^3.25 workspace-wide (`pnpm.overrides`); Anthropic SDK helper needs
  `zod/v4` subpath schemas (see `packages/ai/src/story/anthropic-provider.ts` pattern).
- Enums: define in `packages/types` (const objects) AND prisma schema; drift test
  enforces sync. Mobile NEVER imports `@prisma/client`.
- Storage stores **object keys** in DB, signed URLs generated at read time. Order
  snapshots copy objects to `orders/{id}/` prefix (immutable, excluded from deletion).
- Error copy: backend returns ErrorCode; mobile maps via `errors.*` i18n keys.
- Turkish name suffixes: `withSuffix(name, 'gen'|'dat'|'acc'|...)` from localization pkg.
- Money: Decimal strings ("649.00"), TRY; prices computed ONLY server-side (PricingConfig).
- Jobs (Phase 3+): BullMQ queues mirror to `AIJob` rows; progress = real milestones;
  SSE `GET /jobs/:id/stream` (BullMQ QueueEvents) + 2s polling fallback; deterministic
  job ids (`story:{id}:v{version}`); `Idempotency-Key` header on generate/order/payment.
- Narration (Phase 4): sentence-boundary chunks ≤2500 chars → TTS → ffmpeg concat
  (re-encode libmp3lame) → duration via music-metadata → `timings` JSON drives
  player text sync. RNTP owns ALL playback; expo-audio ONLY records.
- Print PDF (Phase 5): Playwright Chromium in worker, `@page 206mm` (3mm bleed),
  sharp pre-size images to 2433px. RGB PDF documented as mock-print acceptable.
- Entitlements: `PLAN_ENTITLEMENTS` in types pkg; EntitlementService + guards (Phase 3);
  voice-clone premium badge BEFORE recording starts (§36 hard rule).
- Mock purchase flow: paywall → dev-only `POST /subscription/mock/purchase` → same
  normalized webhook pipeline as RevenueCat.

## Phase status (see plan file §13 for full checklists)

- ✅ **Phase 1 — Foundation**: monorepo, all packages, Prisma schema+migration+seed,
  API (auth email+apple/google verify, refresh rotation+reuse detection, users+deletion
  grace, children+recommendations v0, uploads signed URLs, app-config gate, health),
  docker-compose, CI workflow, Expo scaffold (fonts/i18n/query/auth store/basic screens),
  smoke-tested end-to-end incl. IDOR + refresh reuse rejection.
- ⏳ **Phase 2 — Core Mobile UI** (next): component library + pixel-accurate screens
  from `docs/design-reference/src/screens/*.tsx` (Splash starfield/moon/book SVG,
  4-slide onboarding, auth with Apple/Google buttons, child setup with interest chips,
  Home sections, custom tab bar with raised Oluştur button, Profile). Add child switcher.
  Known prototype gaps to fix listed in plan §2.3 (age-group ids, validation, suffix
  interpolation via withSuffix, onboarding persistence flag).
- Phase 3 stories+jobs+SSE+push+entitlements core; Phase 4 voice+narration+player;
  Phase 5 illustrations+books+PDF; Phase 6 commerce; Phase 7 admin; Phase 8 hardening.
  Done-definition: master prompt §101; final report §103.

## Verification checklist per phase

typecheck + lint + tests green monorepo-wide; API smoke test against docker infra;
mobile `npx expo export --platform ios` bundles; commit per feature with
Co-Authored-By + Claude-Session trailers; push after each phase; keep draft PR updated.
