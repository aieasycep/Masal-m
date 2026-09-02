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
- **PR #2 MERGED + PR #3 MERGED (Aug 28)** — main @ 7ba9dc1. PR #2: story
  variety + wizard UX — user reported "vın vın" and the dinosaur in EVERY
  story. Root cause: prompt-engine AGE_0_2 literally quoted example sounds
  (models copy them) and the full interests list read as mandatory. Fix: no
  quotable examples, interests capped at one theme-fitting touch, ÇEŞİTLİLİK
  KURALLARI block, worker passes the child's last 4 READY stories
  (StoryGenerationInput.recentStories) with a divergence demand — LIVE on
  Render since merge. Mobile: wizard starts at step 2 when the child is
  prefilled; Home category tiles pass ?theme= (with store reset); step-5
  narrator threads create→generating→result→narrate as ?voiceId= preselect;
  library child chips. PR #3: cross-account state leak — logging into a 2nd
  account inherited the previous account's persisted query cache +
  selectedChildId → FORBIDDEN_OWNERSHIP on create ("Bu içeriğe erişim iznin
  yok") + privacy flash. Fix: src/lib/reset-user-state.ts called from BOTH
  setSession and clearSession (clears queryClient, masalim.query-cache,
  selectedChildId; keeps hasSeenOnboarding); wizard recovers from
  FORBIDDEN/NOT_FOUND on create (refetch children, back to step 1,
  wizard.childGone). Stable emulator-verified APK for user (main): run
  33170943745 (e1544b7).
- **ElevenLabs FREE QUOTA EXHAUSTED (Aug 28 evening)** — 10,000/10,000
  credits used → ALL narrations fail ("Sorun oluştu") on staging for BOTH
  apps; a 6-min story ≈ 5-6k chars so free tier ≈ 2 narrations/month.
  Advice given: Starter $6/mo = 30k credits + unlocks Instant Voice Cloning
  (also fixes the "Annemin Sesi" paid-plan failures). After upgrade user just
  taps "Tekrar Dene" — no code change needed. NOT an app bug.

- **UI/UX REVIEW BRANCH (`uiux-review`)** — review experiment, since APPROVED
  and merged to main (see below). Stable checkpoint: branch `stable-before-uiux-review` +
  local tag `before-uiux-review` @ 7ba9dc1. Side-by-side review APK: package
  `com.masalim.app.uiuxreview`, name "Kendi Hikayem — UI/UX Review", identity
  applied ONLY in the runner (uiux-review-apk.yml mutates app.json at build;
  git-tracked identity untouched); emulator smoke is a second job of the same
  workflow (standalone dispatch-only workflows off-main are NOT dispatchable —
  GitHub only registers default-branch workflows). V1 pass (KendiHikayem_UIUX_
  Fixed.zip): tokens/contrast (coral/accent #B94F35 + coralOnDark for night,
  mutedForeground #71655B, night.muted #91A1B8, sageText/dustyBlueText,
  destructiveDeep), fontSizes.xxs 10→11 + ≥44pt targets + reduced-motion
  (reanimated ReduceMotion.System default — documented in src/lib/motion.ts),
  password show/hide, cold-start onboarding gate, BirthMonthPicker →
  Child.birthDate (no migration; preferences.ageYears still written for
  stable-app compat), voice studio (45s floor via shared VOICE_RECORDING
  constant — client enforces now, API tightens on merge; LOCAL take playback
  in review via preview-player file URI; consent rewrite + child-clone
  notice; level meter), wizard guest-child ("Başka bir çocuk" in-wizard name)
  + general branch, StoryResult 5 tiles 3-per-row, checkout single flow
  configure→address→review (3-label StepBar), paywall copy (no "Sınırsız"),
  settings/audio.tsx (rate 0.8–1.5x + autoFollowPage in app-prefs, player
  seeded). V2 pass (KendiHikayem_UIUX_V2_Delta.zip): entry-point child
  continuity (hero CTA resets stale different-child drafts), recommendation
  cards seed themes+idea via applySuggestion pre-initialize, step-4 age
  hidden for registered children ("Yaş bilgisi profilden alınıyor"), result
  narrate tile "Sesi Değiştir" when narrations exist, Kitap Yap routes to
  illustrate when no READY set, suggestions-header "Tümü" removed. PR #4
  draft later became the promotion PR and was merged Sep 1.
- **NEW UI PROMOTED TO PRODUCTION (Sep 1)** — user gave the explicit "Yeni
  UI'yı onaylıyorum, production'a al" → PR #4 (uiux-review→main) merged @
  401d18b. SINGLE app again: package `com.masalim.app` / "Masalım" carries the
  approved design; the side-by-side review app is obsolete (user told to
  uninstall). uiux-review-apk.yml removed from main in the cleanup PR;
  `uiux-review` branch + checkpoint `stable-before-uiux-review` (@7ba9dc1,
  pre-review rollback) left in place. VOICE_RECORDING 45s floor now enforced
  by the API too (shared constant landed via the merge).
- **Post-review fix train (all MERGED to main, Aug 29–Sep 1)**: PR #5 OpenAI
  moderation provider (staging is now ALL-GPT: AI_PROVIDER=openai,
  AI_MODEL=gpt-4o via cross-vendor model guard in providers.module.ts,
  MODERATION_PROVIDER=openai/gpt-4o-mini; AI_API_KEY holds the OpenAI key —
  reverting to Claude = flip those 3 env values back). PR #6 expressive
  narration: TTS_MODEL defaults to eleven_v3 + NarrationDirector LLM pass
  inserts v3 audio tags per chunk (tag-only guard — story words never change;
  auto-fallback to eleven_multilingual_v2 + plain text; v2 path uses
  storytelling voice_settings 0.35/0.45). PR #7 four-item UX pass: hard word
  budgets + expand-repair in both story providers (countStoryWords/
  minTotalWords in prompt-engine — GPT undershot 'Kısa' to 92 words),
  KeepScreenAwake on job/recording screens (expo-keep-awake ships inside
  expo), reader auto-follow 'sesli slayt' (timings-driven page turns,
  activePageNumber in src/lib/narration-sync), wizard voice step REMOVED
  (4 steps; voiceId threading deleted). PR #8 1s real silence at page
  boundaries in narration concat (AudioChunkInput.gapAfterSeconds, anullsrc
  silence matching clip format; timings cursor shifts by the gap). PR #9
  auto-follow disengage fix: detect hand swipes via onScrollBeginDrag ONLY
  (Android fires momentum-end for programmatic scrolls too — the reader's own
  page turn was mistaken for a swipe), follow re-engages per new narration,
  chip shows explicit açık/kapalı states.
- **GitHub cron NEVER fires keepalive.yml** (state active, zero scheduled
  runs) → Render still spins down after 15 idle min; user advised UptimeRobot
  free 5-min monitor on /health (or Render Starter). Manual dispatch works.
- Artifact downloads need a logged-in GitHub tab (incognito hides the link).
  APK builds: android-apk.yml (push on claude/* + workflow_dispatch on main).
  Verify EVERY handed-over APK via android-crash-log.yml (input apk_run_id).

- **PR #11 MERGED (Sep 1): first-run feature tour** — spotlight engine
  (src/lib/tour-targets.ts + FeatureTour.tsx, SVG Mask scrim, pure JS), Home
  5-step tour, result 2-step + reader auto-follow 1-step hints, persisted
  seenTours in app-prefs, settings "Tanıtımı tekrar göster" row, tour.* i18n
  (790 keys parity). Tour APK: android-apk run 33512730502 (96fecef) —
  emulator verify dispatched; superseded by the server-migration APK below.
- **VPS LIVE (Sep 1) — backend runs on user's OVH server**: deploy-server.yml
  run 33560702506 GREEN → https://api.57-129-6-57.sslip.io/health ok, admin at
  https://admin.57-129-6-57.sslip.io, storage at storage.<same>. Architecture
  (PR #12 + #14): server keeps its host nginx on 80/443 (OTHER projects live
  there — never restart it, `nginx -t` + reload only); Masalım services bind
  127.0.0.1 only (api 8801, minio 8802, admin 8803) via
  deploy/docker-compose.server.yml; deploy/nginx-masalim.conf adds 3 vhosts;
  certbot --nginx handles TLS. Deploy = rsync → /opt/masalim/app, images built
  ON the server, compose up, health check; auto-runs on main pushes touching
  apps/api|admin/packages/deploy. Secrets: SERVER_SSH_KEY +
  AI/TTS/VOICE_CLONE/IMAGE_API_KEY; /opt/masalim/.env generated once by
  remote-setup.sh, providers.env rewritten each deploy. SSH egress BLOCKED
  from this container — server access ONLY via GitHub Actions. VPS DB started
  EMPTY (fresh seed: monetization_v1 config, physical_books OFF; Render test
  data not migrated unless asked). android-apk.yml default EXPO_PUBLIC_API_URL
  now the VPS URL (3a532f4). REMAINING: user tests the VPS APK a few days →
  then delete Render services + keepalive.yml (+ UptimeRobot). User reminded
  to rotate server password + regenerate the SSH deploy key (private key was
  visible in a screenshot).

- **MONETIZATION LIVE MODEL IMPLEMENTED (Sep 1, PR #13)** — hybrid credits,
  all numbers user-locked on MAX-cost basis (v3+görsel her masalda; net =
  sticker×0.708; ₺15,5/kredi tavan): story costs SHORT 3/MEDIUM 6/LONG 10
  kredi (1 kr ≈ 1 dk; first narration+illustration set INCLUDED, extras half
  2/3/5); PREMIUM ₺999,99/ay + 30 kr/ay kota (tavan kullanımda bile %34 marj);
  packs FREE ₺50/kr (6/12/30 = ₺299,99/₺599,99/₺1.499,99), member ₺40/kr
  (₺239,99/₺479,99/₺1.199,99); signup gift 6 kr + FREE aylık kota 3 kr
  ("ayda 1 kısa masal"); purchased credits never expire; yearly DEFERRED.
  Backend: CreditLedger (quota/balance split, idempotent refund/grant) +
  User.creditBalance; EntitlementService.consumeCredits (kota→bakiye, CAS tx)
  + INSUFFICIENT_CREDITS (402); prices in PricingConfig row monetization_v1
  (runtime-read → change without app update); /subscription/offerings serves
  plan-priced packs (_std/_member DOUBLE products — stores can't per-user
  price); NON_RENEWING_PURCHASE grants via same normalized webhook/mock
  pipeline. Mobile: comparison-table paywall (user's screenshot layout, NO
  time trial), quota.tsx → "Kredilerim" wallet (packs in-place),
  credit-aware Home banner, wizard duration cards show 3/6/10 badges,
  INSUFFICIENT_CREDITS routes to wallet everywhere. **Regenerate = 1 kredi
  (Sep 2, user: "her tekrarı 1 kredi", no free retries)**:
  ILLUSTRATION_REGENERATE_CREDIT_COST in types; regenerate() consumes up
  front (ref illustration_regen/`${illustrationId}:${uuid}`, payload
  creditRefId), processor refunds THAT ref on terminal failure (never the
  set's); mobile ConfirmSheet + "1 kredi" chip on illustrate + cover editor.
  Wallet discoverability fix (same PR): Profile "Kredilerim" row (live
  count), Home header 🎟 pill (all plans), paywall "Kredilerimi Gör" link —
  before this the wallet was reachable ONLY via the low-credit banner.
  Verified:
  scratchpad/smoke-monetization.sh (gift→kota→bakiye→insufficient→pack→
  resume→print gate) + premium path (30 kr kota, member packs).
- **BOOK PRINT = "YAKINDA" (launch decision)**: physical_books flag seeds
  DISABLED (create-only — existing DBs keep value; admin panel toggles);
  orders quote/create throw FEATURE_DISABLED server-side; mobile preview
  print CTA shows YAKINDA badge + note instead of checkout. Digital
  books/preview untouched.
- **Illustration style fix**: STYLE_TEMPLATES rewritten as mutually exclusive
  medium specs with negatives; style now LEADS sheet+edit prompts; edit
  prompt carries "reference = identity only" + quality tier. Root cause of
  "hep aynı tarz görsel": near-synonym templates + 'Character sheet:' anchor
  + edit call's preserve-the-reference dominance. Picker descriptions now
  concrete (Pixar tarzı / suluboya kâğıdı vs.). Style-sample thumbnails on
  picker cards = open idea (needs IMAGE_API_KEY one-off generation).

## Environment gotchas

- ⚠ NestJS runs via `pnpm dev` (nest start) — NEVER tsx (esbuild drops
  emitDecoratorMetadata → DI breaks). eslint consistent-type-imports is OFF in
  apps/api for the same reason.
- Integration tests: `NODE_ENV=test` skips throttling (shared Redis buckets).

## Verification checklist per phase

typecheck + lint + tests green monorepo-wide; API smoke test against docker infra;
mobile `npx expo export --platform ios` bundles; commit per feature with
Co-Authored-By + Claude-Session trailers; push after each phase; keep draft PR updated.
