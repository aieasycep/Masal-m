# Masalım — Database

PostgreSQL via Prisma (`packages/database/prisma/schema.prisma`). Enums are
defined once as const objects in `@masalim/types` and mirrored as Prisma
enums; `packages/database/src/__tests__/enum-drift.test.ts` fails CI if they
drift.

## Model map

- **Identity**: `User` (soft delete, denormalized `subscriptionPlan`),
  `AuthIdentity` (email/apple/google, multi-provider per user),
  `RefreshToken` (sha256 hash only; rotation + family revocation on reuse),
  `PasswordReset`, `DeletionRequest` (7-day grace; cancellable at login).
- **Family**: `Child` (interests, preferences, soft delete),
  `RecommendationTemplate` (seeded, interest→themes/prompt seeds).
- **Voice**: `VoiceProfile` (consentAcceptedAt required, recording/preview
  keys, retention-aware), `SystemVoice` (admin-managed catalogue, lazy
  preview keys).
- **Stories**: `Story` (wizard fields + generated text/summary/cover prompt,
  `version`), `StoryPage` (text + illustration prompt/key),
  `StoryRevision` (copy-on-write archive per edit), `Favorite`,
  `PlaybackPosition` (continue listening).
- **Audio**: `Narration` (per story-version+voice, audio key, duration,
  `timings` JSON for text sync).
- **Illustrations**: `IllustrationSet` (style, characterBible JSON,
  characterReference), `Illustration` (per page or cover, `selected` flag
  for alternatives).
- **Books**: `Book` (cover/dedication/back cover, printPdfKey, soft delete),
  `BookPage` (text/layout/illustration link).
- **Commerce**: `Address` (Turkish il/ilçe structure), `Order` (server-priced
  Decimals, `addressSnapshot`+`bookSnapshot` JSON with **object keys**,
  `snapshotReady`, unique `idempotencyKey`, `statusTimeline` JSON),
  `Payment` (sanitized rawResponse, unique idempotencyKey), `PricingConfig`
  (versioned pricing table).
- **Subscription**: `Subscription` (one per user, provider-normalized),
  `EntitlementUsage` (userId+key+periodStart unique — atomic monthly quotas).
- **Ops**: `AIJob` (queue mirror: status/progress/attempts/error, unique
  queueJobId), `AIUsageLog` (per-call token/unit estimates), `Notification`,
  `DeviceToken`, `FeatureFlag`, `AdminUser` (separate table from User),
  `AuditLog`.

## Conventions

- Ownership: every private entity carries `userId`; services expose a single
  `findOwned(userId, id)` (404 for missing, 403 for foreign) that all routes
  go through — the IDOR policy lives in exactly one place per module.
- Soft delete (`deletedAt`) on User/Child/VoiceProfile/Story/Book; hard
  purge happens in the deletion worker (account grace flow), which explicitly
  skips the `orders/*` storage prefix (financial/production retention).
- Money is `Decimal(10,2)` in the DB and integer kuruş in computation.
- Storage columns store object **keys**; signed URLs are minted per response.

## Migrations & seed

```
pnpm db:migrate   # prisma migrate dev
pnpm db:seed      # system voices, feature flags, pricing v1, recommendation
                  # templates, admin@masalim.local, demo user + sample story
```
