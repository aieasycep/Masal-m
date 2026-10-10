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
Bu olmadan `NODE_ENV=production` açılmaz (üretim sahte e-postayı reddeder).

**E-posta doğrulama otomatik devreye girer:** SMTP açılır açılmaz yeni kayıtlar
6 haneli kodla e-postalarını doğrular ve **6 kredilik hediye ancak doğrulamadan
sonra** yüklenir (sahte hesapla sınırsız hediye alma yolu kapanır). Daha önce
kayıt olmuş hesaplar ana sayfada engellemeyen bir "E-postanı doğrula" şeridi
görür; hediyelerini zaten almışlardır, ikinci kez verilmez. Google/Apple ile
girenlerin e-postası sağlayıcı tarafından doğrulanmış sayılır.

## 3. Gerçek mağaza satın alma

- **RevenueCat** (uygulama içi Premium + kredi paketleri): proje + ürünler
  (`masalim_premium_monthly`, `masalim_credits_6/12/30_std|_member`), webhook
  adresi `https://api.<alan adı>/subscription/webhook` (bugün
  `api.57-129-6-57.sslip.io`), webhook secret → GitHub secret
  `REVENUECAT_WEBHOOK_SECRET`; mobil uygulamada
  `EXPO_PUBLIC_PURCHASES_PROVIDER=revenuecat` + RevenueCat'in iOS ve Android
  "public API key"leri (`EXPO_PUBLIC_REVENUECAT_IOS_KEY`,
  `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`) ile yeni APK (ben derlerim). Uygulama
  RevenueCat'e Masalım kullanıcı kimliğiyle giriş yapar; webhook'taki
  `app_user_id` bu yüzden hesapla eşleşir. Üye fiyatlı paketi (`_member`)
  Premium olmayan biri mağazadan alırsa sunucu ödediği tutar kadar kredi verir
  (ör. 6'lık üye paketi → 4 kredi) ve olayı loglar.
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
- **Push bildirimleri** (şu an test APK'larında hiç kaydolmuyor — Expo'nun
  proje kimliği yok): expo.dev'de ücretsiz hesap aç → bana söyle, `eas init`
  ile proje kimliğini (`extra.eas.projectId`) `app.json`'a işlerim → Firebase
  Console'da proje aç, Android uygulaması (`com.masalim.app`) ekle, "FCM V1
  servis hesabı" JSON'unu indir → expo.dev → proje → Credentials → Android →
  FCM V1 → JSON'u yükle → sunucu tarafında `PUSH_PROVIDER=expo` (+ istersen
  `EXPO_ACCESS_TOKEN`). Bunlar olmadan uygulama sessizce bildirimsiz çalışır.

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
6. Deploy Server → Run workflow → `run_backup` işaretli: ilk yedeğin alınıp
   doğrulandığını log'da gör (`KONTROL: tamam`).

## 7. Alan adı değişikliği (istediğin zaman)

Bugün adresler `57-129-6-57.sslip.io` üzerinden (IP'ye bağlı, üçüncü taraf).
Kendi alan adına geçmek tek ayardır:

1. DNS'te `api.`, `storage.`, `admin.` alt alanlarını A kaydıyla sunucu IP'sine
   (`57.129.6.57`) yönlendir; birkaç dakika bekle.
2. GitHub → Settings → Secrets and variables → Actions → **Variables** → New
   repository variable → Name `MASALIM_DOMAIN`, Value `masalim.app` gibi
   (başında `api.` olmadan, taban alan adı).
3. Actions → Deploy Server → Run workflow. Dağıtım nginx'i ve sertifikaları
   yeni ada göre kurar, sunucudaki `.env` adreslerini günceller
   (`deploy/set-domain.sh`), admin paneli yeni API adresiyle derlenir.
4. Actions → Android APK → Run workflow (`api_url` boş): APK yeni adresi
   gömülü gelir; emülatör doğrulamasından sonra linkini veririm.

Eski sslip.io sertifikası sunucuda kalır, zararsızdır. RevenueCat webhook
adresini de yeni alan adıyla güncellemeyi unutma (§3).

## 8. Yedekler

Her gece 03:30'da sunucuda veritabanı dökümü + medya aynası alınır, 14 gün
saklanır (`/opt/masalim/backups`). Ayrıntı ve geri dönme komutları:
`docs/deploy-server.md` → "Yedekleme". Sunucunun kendisi kaybolursa yedek de
gider; dış depo (Backblaze B2 / Cloudflare R2) istersen tek secret'la eklenir.

## 9. Medya deposu (MinIO) — canlıya geçmeden önce karar

Sunucudaki medya deposu MinIO'nun topluluk sürümü. MinIO, Ekim 2026 itibarıyla hazır
konteyner imajlarını yayınlamayı bıraktı (Docker Hub ve quay.io depoları kaldırıldı).
Sunucu daha önce indirdiği imajla çalışmaya devam ediyor ve dağıtım bu imajı yeniden
indirmeye çalışmıyor; ama yeni bir sunucu kurulamaz ve güvenlik güncellemesi gelmez.
Öneri: canlıya geçmeden önce medyayı yönetilen bir S3 uyumlu depoya taşı (Cloudflare
R2 ya da Backblaze B2; 10 GB'a kadar ücretsiz). Uygulama bunu zaten destekliyor —
sunucudaki `.env`'de `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`,
`STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_FORCE_PATH_STYLE=false` değişir; mevcut
medyayı `mc mirror` ile taşırım. Bu aynı zamanda sunucu dışı yedek sorununu da çözer
(§8). Hesabı açıp anahtarları GitHub secret olarak eklediğinde söyle.

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
