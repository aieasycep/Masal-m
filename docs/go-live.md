# Masalım — Canlıya Geçiş Kontrol Listesi

Sunucu şu an **test modunda** (`NODE_ENV=staging`): gerçek yapay zekâ anahtarları
çalışıyor ama ödeme, abonelik, e-posta ve bildirim sağlayıcıları "mock" (sahte).
Bu sayede telefondan ücretsiz Premium/kredi alıp her şeyi deneyebiliyorsun —
**ama aynı uçlar kayıt olan herkese açık.** Gerçek kullanıcı almadan önce bu
listenin tamamı bitmeli. Sıra önemli: 1–5 hazırlık, 6 tek seferlik geçiş.

## 1. Claude API anahtarı

`docs/deploy-server.md` → Adım 7. GitHub secret: `ANTHROPIC_API_KEY`. Bunsuz
dağıtım ilk adımda durur.

## 2. E-posta gönderimi (SMTP)

Şifre sıfırlama kodu gerçek e-posta ister. Ücretsiz katmanı olan bir servis
seç (örn. Resend, Brevo); SMTP bilgilerini al ve GitHub secret olarak ekle:

- `SMTP_URL` → `smtps://KULLANICI:ŞİFRE@smtp.sunucu.com:465` biçiminde
  (servisin verdiği kullanıcı adı/şifre; 587 portu için `smtp://…:587`).
- `MAIL_FROM` → gönderen adresi (örn. `no-reply@masalim.app`; alan adının
  o serviste doğrulanmış olması gerekir). Boş bırakılırsa varsayılan kalır.

Secret eklendikten sonraki ilk dağıtımda sunucu kendiliğinden `MAIL_PROVIDER=smtp`
ile çalışır (adaptör kodda hazır: nodemailer). Secret yokken sahte e-posta kalır
ve kodlar yalnızca geliştirici bilgisayarında loglanır (sunucu logunda görünmez).
E-posta doğrulama (hediye kredinin ancak doğrulanmış e-postaya verilmesi) ayrı
bir iş — SMTP çalışınca eklenir. Bu olmadan `NODE_ENV=production` açılmaz
(üretim sahte e-postayı reddeder).

## 3. Gerçek mağaza satın alma

- **RevenueCat** (uygulama içi Premium + kredi paketleri): proje + ürünler
  (`masalim_premium_monthly`, `masalim_credits_6/12/30_std|_member`), webhook
  adresi `https://api.57-129-6-57.sslip.io/subscription/webhook`, webhook
  secret → GitHub secret `REVENUECAT_WEBHOOK_SECRET`; mobil uygulamada
  `EXPO_PUBLIC_PURCHASES_PROVIDER=revenuecat` + RevenueCat API anahtarı ile
  yeni APK (ben derlerim).
- **iyzico** yalnızca fiziksel kitap açılırsa (`physical_books` bayrağı);
  şu an "YAKINDA".

## 4. Admin paneli

İlk girişte **Ayarlar → Şifre değiştir** ile varsayılan şifreyi değiştir
(`admin@masalim.local / admin-dev-password-1` herkesin bildiği bir değer).
Demo kullanıcı (`demo@masalim.local`) test modu dışında otomatik devre dışı.

## 5. Mobil uygulama yayını

- Play Store için kendi **imzalama anahtarın** (upload key) gerekir — test
  APK'ları Expo'nun herkese açık debug anahtarıyla imzalı; mağazaya bununla
  çıkılamaz. Söyle, `android-apk.yml`'e keystore secret'ı eklerim.
- Google ile giriş: `GOOGLE_CLIENT_ID` secret'ı (Google Cloud Console → OAuth
  istemci kimliği). Boşken Google girişi güvenlik nedeniyle kapalı.
- Apple ile giriş: Apple Developer hesabı + bundle id (`APPLE_BUNDLE_ID`).

## 6. Geçiş günü (tek seferlik, bende)

1. Sunucudaki `/opt/masalim/.env` içinde `NODE_ENV=production`; `providers.env`
   üzerinden `PAYMENT_PROVIDER=iyzico` (ya da fiziksel kitap kapalıysa
   mevcut mock yerine devre dışı), `SUBSCRIPTION_PROVIDER=revenuecat`,
   `MAIL_PROVIDER=smtp`, `PUSH_PROVIDER=expo` (+ `EXPO_ACCESS_TOKEN`).
   Üretim modu **tüm mock sağlayıcıları ve Swagger'ı otomatik kapatır**;
   `/subscription/mock/*` ve `/payments/mock/*` 404 döner.
2. Render servislerini sil (dashboard.render.com), UptimeRobot varsa kapat.
3. Sunucu şifresini ve SSH dağıtım anahtarını yenile (daha önce ekranda
   göründüler).
4. Son dağıtımı `story_smoke` ile çalıştır → gerçek bir masal üretilir.
5. Telefondan gerçek (sandbox olmayan) bir satın alma dene; admin panelinde
   kredi defterinde göründüğünü doğrula.

## Bu PR'da yapılanlar (güvenlik denetimi, Ekim 2026)

Hesap ele geçirme, kredi atlatma, başkasının dosyasına erişim, şifre sıfırlama
kodu deneme, oran sınırı/kilitleme, admin oturumu, hesap silme işlemcisi,
moderasyon kapsamı ve dağıtım betikleri düzeltildi — ayrıntı: PR açıklaması.
İkinci tur (bağımsız doğrulamanın bulduğu yeni açıklar): aynı taslağın iki kez
üretilmesi artık iki kez kredi düşmüyor (durum kilidi); eşzamanlı iki istek
"ilk ücretsiz" anlatımı/görsel setini iki kez alamıyor (hikâye başına kilit);
masal silinince kuyruktaki anlatım/görsel işleri krediyi iade ediyor; parçalı
ses dosyası silinemezse saatlik süpürme ElevenLabs'teki klonu tekrar siliyor;
sunucu güncellemesinde süren işler 120 sn tamamlanma süresi alıyor; blok
listesi tam kelime eşliyor ("kasap" artık "kas" yüzünden engellenmiyor);
sistem sesleri seed'i kullanıcı görünür alanları ezmiyor; SMTP adaptörü hazır.
Sonraki PR'a kalan düşük öncelikliler: konteynerlerin root dışı kullanıcıyla
çalışması + Chromium sandbox, admin paneline CSP, MinIO imaj sürümü
sabitleme (doğrulanmış etiket gerekiyor), kitap render kuyruk anahtarı,
push token sahipliği, kullanılmayan yüklemelerin temizliği, Apple nonce,
mobilde çıkışta refresh token iptali, Premium aylık kotanın takvim ayı yerine
fatura dönemine bağlanması, anlatım parça önbelleği (yeniden denemede TTS
kredisi), nginx vhost kopyası ile certbot arasındaki kısa pencere, sslip.io
yerine gerçek alan adı, veritabanı yedeği.
