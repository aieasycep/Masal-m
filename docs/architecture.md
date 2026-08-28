# Masalım — Architecture

## Topology

```
Expo app (apps/mobile) ── REST/JSON ──► NestJS API (apps/api) ──► PostgreSQL (Prisma)
        │                                  │  ├──► Redis (BullMQ queues + pub/sub + throttling)
        │◄── SSE /jobs/:id/stream          │  └──► S3-compatible storage (MinIO locally)
        │◄── Expo push                     └──► Providers: LLM / TTS / voice clone / image /
Next.js admin (apps/admin) ── REST ──►          payment / print / push / mail (env-selected)
```

- One REST API serves both clients. The admin panel uses a **separate JWT
  realm** (`type: 'admin'` tokens, `AdminAuthGuard`, per-route RBAC) — user
  and admin tokens are mutually invalid.
- BullMQ workers run **inside the API process** by default (`WORKER_MODE=inline`);
  `separate` starts an API without workers so a dedicated worker process can
  own the queues.

## Monorepo

pnpm workspaces + Turborepo, `node-linker=hoisted` (Expo compatibility).
Shared packages are built with tsup (ESM+CJS+d.ts):

| Package | Contents |
|---|---|
| `@masalim/types` | Const-object enums (mirrored in schema.prisma with a drift-guard test), error codes, entitlement matrix, domain constants |
| `@masalim/validation` | Zod schemas shared FE/BE — API DTOs (via nestjs-zod), the LLM structured-output contract, admin schemas |
| `@masalim/database` | Prisma schema, client, migrations, seed |
| `@masalim/ai` | Provider interfaces + adapters + deterministic mocks (story/moderation/TTS/voice-clone/image) |
| `@masalim/storage` | StorageProvider (S3 + local dev), `StorageKeys` layout |
| `@masalim/payments` | PaymentProvider (iyzico + mock), PrintProvider (mock) |
| `@masalim/notifications` | Expo push provider + push→route contract |
| `@masalim/api-client` | Typed fetch client (single-flight refresh on 401, Idempotency-Key support) used by mobile |
| `@masalim/localization` | tr/en locale JSONs (CI parity check) + Turkish vowel-harmony suffix helper |
| `@masalim/ui` | Design tokens harvested from the Figma export (colors/spacing/typography/radius/shadows/gradients) |
| `@masalim/analytics` | Event-name registry |

## Async jobs

Every queue job mirrors an `AIJob` row (source of truth the clients poll).
Queues: `story-generation`, `voice-clone`, `narration`, `illustration`,
`book-render`, `order-snapshot`, `print-file`, `deletion`.

- **Progress is real**: processors update the row at actual milestones
  (per chunk / per image / per pipeline stage); every update is published on
  Redis pub/sub (`masalim:job-events:{id}`), which feeds `GET /jobs/:id/stream`
  (SSE — snapshot on connect, live events, 15s heartbeats, completes on a
  terminal state). Mobile falls back to 2s polling when SSE stalls.
- **Idempotency**: deterministic queue keys (`story:{id}:v{n}:gen`,
  `narration:{story}:v{n}:{voice}`, `order:{id}:snapshot`) make double
  submissions return the already-active job; processors re-check entity state
  so re-deliveries are no-ops.
- Retries: 3 attempts, exponential backoff; moderation rejections throw
  `UnrecoverableError` (no retry); quota consumed at enqueue is refunded on
  terminal failure.

## Domain pipelines

- **Story generation**: moderation pre-check (blocklist + optional LLM
  classifier) happens synchronously at `/stories/:id/generate` → prompt engine
  (age-gated vocabulary, page/word budget, unsafe sentinel) → structured LLM
  output (Zod contract, repair retries) → moderation post-check → pages +
  cover prompt persisted → `STORY_READY` push. Editing is copy-on-write:
  the prior state is archived to `StoryRevision` and `version` bumps.
- **Voice cloning**: premium-gated *before* recording, blocking consent
  (`consentAccepted: z.literal(true)`, stamped server-side), recording keys
  must live under the caller's own upload prefix; the clone worker renders a
  TTS preview and applies the raw-recording retention policy
  (`VOICE_RAW_RETENTION_DAYS`, default delete-on-ready). Deletion removes the
  provider voice + media but keeps existing narrations. Re-record keeps the
  old clone live until the new one is READY.
- **Narration**: sentence-boundary chunks (≤2500 chars) → TTS per chunk →
  ffmpeg concat (single libmp3lame re-encode, 44.1kHz/128k mono) → per-chunk
  timings stored on the row (drives the player's text sync) → signed audio URL.
- **Illustrations**: character-sheet-first (§27) — the sheet's provider
  reference + a verbatim CharacterBible block repeat in every page/cover call.
  Alternatives per page; selecting one repoints the reader/book image.
- **Books/print**: builder autosaves; render worker prints a self-contained
  HTML template (vendored fonts, `@page 206mm` = 200mm trim + 3mm bleed) via
  playwright-core Chromium with sharp pre-sizing images to true 300 DPI.
  Output is RGB (PDF/X via Ghostscript is the documented post-process).
- **Orders**: server-side pricing only (versioned `PricingConfig`, integer
  kuruş math), required `Idempotency-Key`, address+book snapshots in the
  order row, and a snapshot job that copies production assets to the
  immutable `orders/{id}/` prefix (excluded from user deletion) before the
  print provider handoff. Payment verification compares the provider-reported
  paid amount to the expected total (`PAYMENT_AMOUNT_MISMATCH`).
- **Subscriptions**: RevenueCat-shaped webhook and the dev mock-IAP endpoints
  feed the *same* normalized event pipeline; `EntitlementService` resolves
  plan → feature/quota matrix and enforces it server-side (atomic quota
  consume; mobile reads the same resolved set for UI gating).

## Mobile

Expo SDK 57 + Expo Router (typed routes), TanStack Query + Zustand, RHF+zod,
i18next (all copy from `@masalim/localization`; Turkish suffixes via
`withSuffix`). **react-native-track-player owns every playback path**
(background audio + lock-screen controls; the playback service registers in
`index.js` before the router); **expo-audio only records** (metering-driven
mic test, HIGH_QUALITY m4a). Push: expo-notifications, `data.route` carries
the deep-link target (cold-start taps are processed after session restore).
Tokens live in SecureStore; the api-client refreshes single-flight on 401.

## Error contract

Every error is `{error: {code, message, requestId}}` with a canonical
`ErrorCode`; the mobile app maps codes to localized copy (`errors.*`) and
never shows raw codes. App version gate: mobile sends `x-app-version`;
the API returns `APP_VERSION_UNSUPPORTED` (426) below the configured minimum.
