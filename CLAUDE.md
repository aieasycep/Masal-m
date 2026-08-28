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
- ✅ **Phase 2 — Core Mobile UI**: component library (Button/SelectableCard/Chip/Avatar/
  Badge/Input/ConfirmSheet/Screen/ScreenHeader/states/StoryCard/Starfield/TabBar/
  ChildSwitcherSheet), splash+4-slide onboarding, welcome/email auth, child setup+edit,
  full Home + Profile, custom tab bar. (Settings skeleton delivered with Phase 3 slice.)
- ✅ **Phase 3 — Stories**: jobs infra (BullMQ + AIJob mirror + Redis pub/sub + SSE),
  two-phase create/generate, entitlements + mock IAP pipeline, notifications+devices,
  system voices; mobile wizard/generating/result/edit/library/reader/push/settings.
  Smoke: scratchpad/smoke-phase3.sh.
- ✅ **Phase 4 — Voice & Audio**: voice profiles + consent + clone worker + retention,
  narration pipeline (chunk→TTS→ffmpeg concat→timings), RNTP night player + sleep
  timer + text sync, voice studio 9-step flow, re-voice. Smoke: smoke-phase4.sh.
- ✅ **Phase 5 — Illustrations & Books**: character-sheet-first illustration sets +
  alternatives, book builder/cover/preview autosave, Chromium print PDF (206mm/300DPI).
  Smoke: smoke-phase5.sh.
- ✅ **Phase 6 — Commerce**: addresses, kuruş-math pricing, idempotent orders,
  payment verify + snapshot job + print progression; checkout/orders/paywall mobile.
  Smoke: smoke-phase6.sh.
- ✅ **Phase 7 — Admin**: separate JWT realm + RBAC + audit (API) and Next.js panel
  (apps/admin, offline build). Smoke: smoke-phase7.sh.
- ✅ **Phase 8 — Hardening**: analytics ingestion, integration journey tests (CI),
  mobile store tests, quality sweep (no TODO/console.log/any), docs
  (README/architecture/providers/database), final report docs/final-report.md.

## Delivery state (post-completion — keep current)

- **PR #1 (draft): https://github.com/aieasycep/Masal-m/pull/1** — head
  `claude/masalim-implementation-plan-pz1pkl`, base `main` (cut from the first
  scaffold commit; repo was empty). Push access GRANTED and working.
  Subscribed to PR activity; drive-to-green posture applies.
- **CI (ci.yml)**: fixed twice — (1) Chromium probe extended to system Chrome
  paths for runners, (2) integration job now uses STORAGE_PROVIDER=local
  (no MinIO in CI; S3 default threw CredentialsProviderError). Last fix
  pushed as 2353d1f; VERIFY latest run is green.
- **Android APK workflow** (.github/workflows/android-apk.yml): builds release
  APK on runners (expo prebuild + gradle), uploads artifact `masalim-apk`,
  workflow_dispatch input `api_url` bakes the API URL into the bundle.
  First run failed: react-native-track-player 4.1.2 Kotlin nullability vs
  RN 0.86 → fixed via pnpm patch (patches/react-native-track-player.patch,
  MusicModule.kt lines ~548/588 null-safe fromBundle). Push triggers rebuild.
- **Test deployment prep** (user is non-technical, wants phone testing):
  render.yaml blueprint (masalim-api docker + keyvalue redis + free postgres,
  NODE_ENV=staging so mocks allowed), apps/api/Dockerfile (node:22-slim +
  ffmpeg + chromium, migrate+seed on boot), docs/deploy-testing.md (Turkish
  click-by-click: Supabase storage S3 keys → Render blueprint → APK rebuild
  with api_url). User considering Vercel/Render/Supabase — advised
  Render(API+db+redis)+Supabase(storage); Vercel only fits apps/admin.
- **Test deployment LIVE**: user's Render workspace "masalim" runs the
  blueprint; API at https://masalim-api-z6ry.onrender.com (/health ok, db up).
  Splash/icon assets fix (5b918a4) made the APK workflow green; final APK
  dispatched with the user's api_url. masalim-admin web service added to
  render.yaml (NEXT_PUBLIC_API_URL hardcoded to the api URL above); API CORS
  accepts *.onrender.com outside production (main.ts).
- **Startup crash FIXED (b580c47)**: release APK crashed after splash on device.
  Root cause (found via emulator logcat): RNTP 4.1.2 @ReactMethods use `= scope.launch {}`
  expression bodies → return Job not void → TurboModule interop ParsingException at first
  module access. Fix: extended patches/react-native-track-player.patch — all 37 methods
  routed through Unit-returning `launchInScope` wrapper (labels renamed to
  `return@launchInScope`); old null-safe fromBundle hunks folded into regenerated patch.
  NOTE: `pnpm patch` extracts PRISTINE source (existing patch NOT applied) — re-apply
  the old patch in the edit dir before editing, else patch-commit loses prior fixes.
- **android-crash-log.yml**: diagnostic workflow — downloads `masalim-apk` artifact by
  run id (input `apk_run_id`), boots emulator (KVM + reactivecircus runner, API 34),
  installs+launches, prints APP_ALIVE + FATAL EXCEPTION extract at end of job log,
  uploads full logcat artifact. Verified fix: run 31736923379 → APP_ALIVE=yes, clean JS.
  Use this to verify EVERY future APK before handing to user.
- android-apk.yml default EXPO_PUBLIC_API_URL now the live Render URL (no more manual
  api_url input needed).
- **Playback crash FIXED (cf5d6e3)**: tapping narrate/listen killed the app. Emulator
  smoke (hidden route `masalim://debug/player-smoke` + crash-log workflow phase 2)
  reproduced it: MusicService.emit used legacy reactNativeHost → "You should not use
  ReactNativeHost directly in the New Architecture" fatal at first event emission
  (follow-on ForegroundServiceStartNotAllowedException = system restarting the crashed
  sticky service). Patch extended again: bridgeless-safe `currentReactContext()`
  (prefer `ReactApplication.reactHost`, legacy fallback) in emit/emitList. Verified:
  run 31745204779 → APP_ALIVE=yes, SMOKE_ALIVE=yes, smoke played tone to end
  (state=ended position=2.01), zero FATAL. Google sign-in "not working" is expected
  (no OAuth credentials in test builds) — email login for testing.
- **Working APK for user: artifact of run 31742111666** (commit cf5d6e3; supersedes
  31735402753 which still crashed on playback).
- Scheduled self check-ins exist via send_later for CI/APK monitoring;
  re-arm after firing while PR is open.
- **Figma second export applied** (Aug 24): 5 previously missing screens restyled
  to spec — reader (night storybook), story edit, illustration style picker +
  generating takeover, book builder, checkout flow visual language — plus result
  action row + player "Metni göster" wiring; +31 i18n keys; design-reference
  synced. APK workflow got Gradle heap 6g fix (dex-merge OOM at template 2g).
  Latest emulator-verified APK: artifact of run 32709246373.
- ⚠ Workflow-tool subagents are BROKEN in this container (permission handler
  strips every tool call's input); plain Agent-tool subagents work — use those.
- **Real providers LIVE on Render (staging)**: TTS+voice-clone elevenlabs,
  AI anthropic, moderation llm, image openai (user added keys: AI_API_KEY,
  IMAGE_API_KEY, TTS_API_KEY, VOICE_CLONE_API_KEY — note names, not
  ELEVENLABS/OPENAI_*). Lessons: ElevenLabs free plan 402-rejects library AND
  legacy-premade voices via API → seed maps personas to current default roster
  (Matilda/George/Sarah/Brian/Jessica/Charlie), is TTS_PROVIDER-aware, upserts
  by displayName, clears previewKey on id change. Voice cloning needs a paid
  ElevenLabs plan (expected to fail on free). gpt-image-1 may need OpenAI org
  verification — fallback: IMAGE_MODEL=dall-e-3.
- Narrations list/create now prune stale FAILED rows (keep newest per voice,
  none once a newer non-failed exists). Mock-story Turkish fixed via
  packages/ai shared/turkish.ts (evidential, nounGenitive, dative suffix).
- **FINAL Figma reconciliation applied** (Aug 25, KendiHikayem_2.zip — plan §top of
  plan file): all previously self-designed screens replaced with the final specs.
  New shared components (SheetContainer/ListRow/PremiumSheet/QuotaBanner/
  AudioPreviewButton+usePreviewPlayer/LoadingState/StepBar/OrderStatusPill/
  AgeStepper/AvatarEmojiPicker), premiumGold+coverPalettes tokens. Auth 5-view
  spec (code-based reset; NO guest skip — approved deviation). Child flow: new
  /children list, emoji avatar + age stepper stored in preferences
  (avatarEmoji/ageYears; ageRange derived via src/lib/age.ts). Narration select
  rebuilt (status pills, PremiumSheet gates, night generating/done views). Voice
  previews LIVE everywhere (deferral closed). Illustration ready flow (thumb
  strip/alternatives/regenerating overlay). Cover editor (5 palettes →
  Book.coverPalette) + dark BookPreview. Checkout REORDERED:
  preview→address→configure(Özet)→review(Ödeme), StepBar 4 labels. Orders:
  status pill map + 5-step timeline + carrier/trackingUrl/ETA (additive Order
  columns; mock print fills them). Paywall real-offering prices + computed
  discount; /subscription/quota screen; Home QuotaBanner from entitlements.
  Settings suite: ListRow hub, notificationPrefs 5 toggles (additive
  User.notificationPrefs, push honors opt-out), voice-data screen, delete
  double-confirm. EN stays selectable (approved deviation). Migration:
  figma_reconciliation_additions. Deviations documented: no photo upload
  (native surface frozen), postal code stays required, "Ses ve Oynatma" row
  omitted (no backing feature).
- **PR #2 (draft): story variety + wizard UX** (Aug 28) — user reported "vın vın"
  and the dinosaur in EVERY story. Root cause: prompt-engine AGE_0_2 literally
  quoted example sounds (models copy them) and the full interests list read as
  mandatory. Fix: no quotable examples, interests capped at one theme-fitting
  touch, ÇEŞİTLİLİK KURALLARI block, and the worker passes the child's last 4
  READY stories (StoryGenerationInput.recentStories) with a divergence demand —
  goes live on Render only after merge. Mobile: wizard starts at step 2 when the
  child is prefilled; Home category tiles pass ?theme= (with a store reset so the
  one-shot initialize can't swallow it); step-5 narrator threads
  create→generating→result→narrate as ?voiceId= preselect; library child chips
  (childId param existed server-side). New i18n key library.allChildren (727).

## Environment gotchas

- ⚠ NestJS runs via `pnpm dev` (nest start) — NEVER tsx (esbuild drops
  emitDecoratorMetadata → DI breaks). eslint consistent-type-imports is OFF in
  apps/api for the same reason.
- Integration tests: `NODE_ENV=test` skips throttling (shared Redis buckets).
- Known deferred deviation: voice preview playback buttons (wizard step 5,
  voice studio list/review/success rows) await a shared preview-player pass.

## Verification checklist per phase

typecheck + lint + tests green monorepo-wide; API smoke test against docker infra;
mobile `npx expo export --platform ios` bundles; commit per feature with
Co-Authored-By + Claude-Session trailers; push after each phase; keep draft PR updated.
