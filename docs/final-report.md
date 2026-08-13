# Masalım — Final Rapor (Master Prompt §103)

## 1. Tamamlanan modüller

**Mobil uygulama (apps/mobile — Expo SDK 57, Expo Router, TypeScript strict)**
- Onboarding: splash (gece gökyüzü, yıldız alanı, kitap logosu), 4 slayt, atlama + kalıcılık
- Kimlik: Apple / Google / e-posta girişi, kayıt, şifre sıfırlama (OTP), oturum yenileme
- Çocuk profilleri: kurulum (yaş grubu + 12 ilgi alanı + özel ilgi), düzenleme/silme, çocuk değiştirici
- Ana sayfa: kişisel öneriler, hero CTA, devam eden dinleme, son hikâyeler, kategoriler
- Hikâye sihirbazı (5 adım): çocuk → kahraman → tema/fikir (moderasyon dostu) → ayarlar → anlatıcı; taslak kalıcılığı, kota/moderasyon hataları için zarif kurtarma
- Üretim ekranı: SSE ile **gerçek ilerleme** (polling yedeği), gece tasarımı, hata/yeniden dene
- Sonuç ekranı, hikâye düzenleme (versiyonlu), kitaplık (arama/filtre/sonsuz kaydırma/işlem menüsü), okuyucu
- Ses stüdyosu: 9 adım (tanıtım → sahip → **engelleyici onay** → mikrofon testi (dBFS) → kayıt (30-90sn, duraklat, canlı dalga formu) → onayla-yükle → gerçek iş ilerlemesi → başarı/hata "Kaydın güvende")
- Gece modu oynatıcı: react-native-track-player (arka plan + kilit ekranı), ±15sn, hız, uyku zamanlayıcı (kademeli kısma), "Metni göster" zaman-senkron paragraf vurgusu
- Yeniden seslendirme, görselleştirme akışı (5 stil, alternatifler, yeniden üretme), kitap oluşturucu + kapak editörü + dijital önizleme (otokayıt)
- Sipariş akışı: yapılandırma (canlı sunucu fiyatı) → adres → özet (baskı dosyası hazırlık kapısı) → ödeme → başarı; sipariş listesi/detayı (zaman çizelgesi, kargo takip, iptal)
- Paywall (aylık/yıllık, özellik matrisi, geri yükleme), PurchasesGateway (mock ↔ RevenueCat)
- Push bildirimleri (rota taşıyan), ayarlar (hesap/dil/bildirim/silme talebi + iptal)

**API (apps/api — NestJS 11, Prisma, BullMQ)**
- Auth (argon2, JWT 15dk + opak refresh rotasyonu ve aile iptali, Apple/Google sunucu doğrulaması, kilitleme), kullanıcılar (7 gün silme tanıma süresi), çocuklar + öneriler
- Hikâyeler: iki fazlı oluştur/üret, prompt motoru (yaşa göre), moderasyon ön/son kontrol, yapılandırılmış LLM çıktısı, kota tüket/iade, telif kaydı (AIUsageLog)
- İşler: AIJob aynası, deterministik kuyruk anahtarları (çift gönderim = aynı iş), SSE akışı
- Sesler: onay damgalı klonlama (premium kapısı **kayıttan önce**), saklama politikası, sahiplik doğrulamalı kayıt anahtarları; seslendirme (cümle sınırlı parçalama → TTS → ffmpeg birleştirme → zamanlamalar)
- Görseller: karakter-sayfası-önce tutarlılık (CharacterBible), alternatif/yeniden üretme/seçim
- Kitaplar: oluşturucu CRUD + otokayıt, Chromium baskı PDF'i (206mm = 200+3mm taşma, sharp ile gerçek 300 DPI)
- Ticaret: adresler, kuruş-aritmetiği fiyatlandırma (miktar indirimi, ücretsiz kargo eşiği), **Idempotency-Key zorunlu** siparişler, ödeme doğrulamada tutar eşleşmesi, değiştirilemez sipariş anlık görüntüsü (orders/{id}/), baskı sağlayıcı ilerlemesi + kargo push'u
- Abonelik: RevenueCat biçimli webhook + geliştirici mock IAP'ı aynı normalize olay hattından; EntitlementService (atomik aylık kotalar)
- Bildirimler (uygulama içi + Expo push, ölü token temizliği), analitik alımı, sağlık/app-config sürüm kapısı
- Admin: ayrı JWT alanı, RBAC (ADMIN/SUPPORT/OPERATIONS), denetim kaydı; panolar/kullanıcılar/işler(yeniden dene)/hikâyeler(moderasyon)/siparişler/sistem sesleri/bayraklar/denetim

**Admin paneli (apps/admin — Next.js 15)**: giriş, role duyarlı gezinme, tüm yönetim sayfaları; çevrimdışı derlenebilir.

## 2. Kullanılan teknoloji yığını

pnpm + Turborepo monorepo · React Native 0.86 / Expo SDK 57 / Expo Router · TanStack Query + Zustand + RHF/zod · react-native-track-player (oynatma) + expo-audio (yalnız kayıt) · NestJS 11 + nestjs-zod + Prisma 6 + PostgreSQL · Redis + BullMQ (+ pub/sub SSE) · S3/MinIO · ffmpeg-static · playwright-core + sharp (baskı PDF) · i18next (tr tam / en iskelet, CI parite kontrolü) · Jest + Vitest + Supertest.

## 3. Çalıştırma komutları

```bash
pnpm install
cp .env.example .env
docker compose up -d           # postgres + redis + minio
pnpm db:migrate && pnpm db:seed
pnpm dev:api                   # :3001 (Swagger /docs)
pnpm dev:admin                 # :3002 (admin@masalim.local / admin-dev-password-1)
pnpm dev:mobile                # Expo (EAS dev client gerekli)
```
Testler: `pnpm test` · `pnpm --filter @masalim/api test:integration` · `pnpm i18n:check`

## 4. Ortam değişkenleri

Tam açıklamalı liste **.env.example** dosyasındadır: veritabanı/Redis, JWT sırları, depolama (S3/MinIO), sağlayıcı seçicileri (AI/MODERATION/TTS/VOICE_CLONE/IMAGE/PAYMENT/SUBSCRIPTION/PRINT/PUSH/MAIL), iyzico/RevenueCat/ElevenLabs/Expo anahtarları, sürüm kapısı, worker modu, FFMPEG_PATH/CHROMIUM_PATH.

## 5. Mock ↔ Gerçek sağlayıcı durumu

| Servis | Mock (varsayılan) | Gerçek adaptör |
|---|---|---|
| Hikâye LLM | Deterministik Türkçe hikâye | ✅ Anthropic + OpenAI (env ile) |
| Moderasyon | Kelime engel listesi | ✅ LLM sınıflandırıcı |
| TTS | Çalınabilir WAV melodi | ✅ ElevenLabs |
| Ses klonlama | Anında sahte klon | ✅ ElevenLabs IVC |
| Görsel | Stil renkli SVG→PNG | ✅ OpenAI gpt-image-1 |
| Ödeme | Otomatik başarı (.13 → hata) | ✅ iyzico Checkout Form |
| Abonelik | Mock IAP uçları | ✅ RevenueCat webhook hattı |
| Baskı | Aşamalı PENDING→SHIPPED | ⚠ Arayüz hazır — Türk baskı API'si seçilmedi (docs/providers.md) |
| Push | Log | ✅ Expo Push |
| Depolama | Yerel disk (imzalı URL) | ✅ S3/R2/MinIO |
Üretim modu mock sağlayıcıyı **açılışta reddeder**.

## 6. Eksik / dış bağımlılığa bağlı işler

- Gerçek sağlayıcı anahtarları girilmedi (bu ortamda yok) — kod tamam, env ile aktive edilir.
- Türk baskı sağlayıcısı entegrasyonu: arayüz + mock hazır; gerçek API seçimi ticari karar.
- Cihaz gerektiren doğrulamalar: kilit ekranı denetimleri, Apple/Google girişinin uçtan uca testi, push alımı, IAP — kodlar eksiksiz ve derleniyor; EAS dev client + geliştirici hesapları gerektirir.
- Ertelenen bilinçli sapma: ses önizleme oynatma düğmeleri (sihirbaz 5. adım, stüdyo satırları) ortak önizleme-oynatıcı geçişini bekliyor.
- PDF çıktısı RGB; PDF/X-CMYK gerektiren matbaalar için Ghostscript adımı belgelendi.

## 7. Testler

- API birim: token rotasyonu/yeniden kullanım reddi, sürüm kapısı, entitlement motoru (7 senaryo)
- API entegrasyon (CI'da pg+redis servisleriyle): kayıt→me→refresh reuse reddi, IDOR 403, iki fazlı hikâye + kota, engel listesi reddi (kota iadesiz), ses onayı + premium kapısı, sipariş teklifi + idempotency
- Paketler: prompt motoru (5), Türkçe ek yardımcı (32), enum kayma koruması
- Mobil: sihirbaz + ödeme mağaza durumları (10)
- Uçtan uca duman senaryoları (scratchpad smoke-phase3..7.sh ile doğrulandı): üç kritik yolculuk — hikâye üretimi/dinleme, ses klonlama/seslendirme, kitap/sipariş — mock sağlayıcılarla tamamen yeşil.

## 8. Dağıtım

API+worker Docker (ffmpeg + Chromium içeren imaj), Postgres/Redis yönetilen servis, `prisma migrate deploy`; admin Vercel/Node; mobil EAS Build (dev/staging/prod profilleri). Ayrıntı: README §Deployment, docs/architecture.md.
