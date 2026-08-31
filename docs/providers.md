# Masalım — Provider Integrations

Every external service sits behind an interface, is selected by env var, and
ships with a **complete mock** so the whole product runs end-to-end with zero
credentials. Production config validation **refuses `*_PROVIDER=mock`** at
boot (`apps/api/src/config/env.ts`) — a prod deploy with a missing key fails
fast instead of silently mocking.

| Concern | Env | Real adapter | Mock behavior |
|---|---|---|---|
| Story LLM | `AI_PROVIDER=mock\|anthropic\|openai`, `AI_API_KEY`, `AI_MODEL` | Anthropic (`messages.parse` + zod output format, default `claude-opus-5`) / OpenAI (JSON mode + 2 repair retries) | Deterministic Turkish story from theme motifs, ~2s delay |
| Moderation | `MODERATION_PROVIDER=mock\|llm\|openai`, `MODERATION_MODEL` | Blocklist + LLM classifier ("SAFE"/"UNSAFE:<cat>"): `llm` = Anthropic (default `claude-opus-5`), `openai` = OpenAI chat (default `gpt-4o-mini`); both share `AI_API_KEY` | Blocklist only |
| TTS | `TTS_PROVIDER=mock\|elevenlabs`, `TTS_API_KEY`, `TTS_MODEL` | ElevenLabs, default `eleven_v3` (expressive): chunks are annotated with v3 audio tags by a NarrationDirector LLM pass (tag-only guard — story words never change), auto-fallback to `eleven_multilingual_v2` + plain text if v3 rejects; v2 models use storytelling voice settings (stability 0.35, style 0.45). Set `TTS_MODEL=eleven_multilingual_v2` to opt out of v3. | Playable WAV melody whose length tracks the text (whole narration pipeline works) |
| Voice clone | `VOICE_CLONE_PROVIDER=mock\|elevenlabs`, `VOICE_CLONE_API_KEY` | ElevenLabs IVC (`/v1/voices/add`), real `deleteVoice` | Instant clone (rejects empty audio) |
| Images | `IMAGE_PROVIDER=mock\|openai`, `IMAGE_API_KEY`, `IMAGE_MODEL` | OpenAI gpt-image-1, character-sheet reference via `images.edit` | Style-tinted SVG→PNG via sharp |
| Storage | `STORAGE_PROVIDER=s3\|local` + S3 creds | Any S3 API (MinIO locally, R2/S3 in prod), signed PUT/GET | Local disk + HMAC-signed dev URLs served by the API |
| Payment | `PAYMENT_PROVIDER=mock\|iyzico`, `IYZICO_*` | iyzico Checkout Form (IYZWSv2 HMAC), callback verify, refund | Auto-success; amount ending `.13` fails; completion via `POST /payments/mock/complete` |
| Print | `PRINT_PROVIDER=mock` | **No Turkish print API selected yet** — implement `PrintProvider` (`createOrder/getOrder/cancelOrder`) in `@masalim/payments` and register it in `providers.module.ts` | Staged PENDING→IN_PRODUCTION→SHIPPED with tracking number (20s/stage in dev) |
| Subscriptions | `SUBSCRIPTION_PROVIDER=mock\|revenuecat`, `REVENUECAT_WEBHOOK_SECRET` | RevenueCat webhook (`Authorization` shared secret) → normalized events | `POST /subscription/mock/purchase|expire` drive the same event pipeline |
| Push | `PUSH_PROVIDER=mock\|expo`, `EXPO_ACCESS_TOKEN` | Expo Push API with dead-token pruning | Logged sends |
| Mail | `MAIL_PROVIDER=mock\|smtp`, `SMTP_URL` | SMTP-ready service | OTPs logged to console |

Cross-vendor model guard: `AI_MODEL`/`MODERATION_MODEL` values that don't match
the selected vendor (e.g. a leftover `claude-*` model with `AI_PROVIDER=openai`)
fall back to the vendor default in `providers.module.ts` instead of failing every
request. All-OpenAI staging recipe: `AI_PROVIDER=openai`, `AI_MODEL=gpt-4o`,
`MODERATION_PROVIDER=openai`, `MODERATION_MODEL=gpt-4o-mini`, `AI_API_KEY=<OpenAI key>`.

Mobile-side purchases (`apps/mobile/src/lib/purchases.ts`):
`EXPO_PUBLIC_PURCHASES_PROVIDER=mock|revenuecat` — mock drives
`POST /subscription/mock/purchase` (exercising the full backend entitlement
path); revenuecat uses `react-native-purchases` and relies on the webhook for
entitlement truth.

## Print PDF notes

The render worker outputs an RGB PDF at exact physical size (206mm/300 DPI,
3mm bleed). Turkish print shops that require PDF/X-1a CMYK: post-process with
Ghostscript, e.g.

```
gs -dPDFX -dBATCH -dNOPAUSE -sColorConversionStrategy=CMYK \
   -sDEVICE=pdfwrite -sOutputFile=print-x.pdf print.pdf
```

## Adding a real provider

1. Implement the interface in the matching package (`@masalim/ai`,
   `@masalim/payments`, …) — mocks show the expected semantics.
2. Register it in `apps/api/src/providers/providers.module.ts` behind the env
   switch and extend the `providerEnum` in `config/env.ts`.
3. Add the credentials to `.env.example` and the deployment secrets.
