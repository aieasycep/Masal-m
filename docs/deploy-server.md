# Masalım — Kendi Sunucuna Kurulum (OVH VPS, adım adım)

Bu rehber Masalım'ın canlı ortamını Render yerine kendi sunucunda
(57.129.6.57, Ubuntu) çalıştırmak içindir. Kurulduktan sonra:

- API, veritabanı (PostgreSQL), Redis ve medya deposu (MinIO) **tek sunucuda**
  çalışır — uyku moduna geçme / soğuk açılış sorunu **tamamen biter**.
- Her `main` güncellemesi GitHub Actions ile sunucuya **otomatik** yüklenir.
- HTTPS sertifikaları (Let's Encrypt/certbot) otomatik alınır ve yenilenir.
- **Sunucudaki diğer projelere dokunulmaz:** her şey /opt/masalim klasöründe
  yaşar, Masalım servisleri yalnızca 127.0.0.1'e açılır ve mevcut host
  nginx'ine sadece kendi alan adlarımız için üç sanal sunucu eklenir
  (`nginx -t` sınaması + yalnızca `reload` — restart yok).

Adresler (kurulum sonrası):

| Servis       | Adres                                                        |
| ------------ | ------------------------------------------------------------ |
| API          | https://api.57-129-6-57.sslip.io/health                      |
| Admin paneli | https://admin.57-129-6-57.sslip.io                           |
| Medya deposu | https://storage.57-129-6-57.sslip.io (uygulama içi kullanım) |

> `sslip.io` alan adı satın almadan IP'ye çözünen ücretsiz bir servistir.
> İleride gerçek bir alan adı (örn. `masalim.app`) bağlamak istersen bana
> söylemen yeterli — 3 dosyada host adını değiştirip DNS kaydını tarif ederim.

---

## Adım 0 — Sunucu şifresini DEĞİŞTİR (önemli!)

Şifre sohbette paylaşıldığı için önce onu değiştiriyoruz. Bilgisayarında bir
terminal aç (Windows'ta PowerShell) ve bağlan:

```
ssh ubuntu@57.129.6.57
```

(İlk bağlantıda "fingerprint" sorusuna `yes` yaz.) Girdikten sonra:

```
passwd
```

Önce mevcut şifreyi, sonra iki kez yeni şifreni yaz. Yeni şifreyi kimseyle
paylaşma — bundan sonrası şifre gerektirmeyecek (anahtarla çalışacağız).

## Adım 1 — Tek seferlik sunucu kurulumu (kopyala-yapıştır)

Aynı SSH ekranında aşağıdaki bloğu **komple** kopyalayıp yapıştır ve Enter'a
bas (Docker kurulumu birkaç dakika sürebilir):

```bash
command -v docker >/dev/null 2>&1 || (curl -fsSL https://get.docker.com | sudo sh)
sudo usermod -aG docker ubuntu
sudo mkdir -p /opt/masalim && sudo chown ubuntu:ubuntu /opt/masalim
rm -f ~/.ssh/masalim_deploy ~/.ssh/masalim_deploy.pub
ssh-keygen -t ed25519 -f ~/.ssh/masalim_deploy -N "" -C masalim-deploy
cat ~/.ssh/masalim_deploy.pub >> ~/.ssh/authorized_keys
echo
echo "===== SERVER_SSH_KEY (asagidaki TUM satirlari kopyala) ====="
cat ~/.ssh/masalim_deploy
echo "===== SON ====="
```

(İlk satır Docker'ı yalnızca kurulu DEĞİLSE kurar — sunucudaki diğer
projelerin Docker'ı varsa ona dokunulmaz.)

Ekranın sonunda `-----BEGIN OPENSSH PRIVATE KEY-----` ile başlayıp
`-----END OPENSSH PRIVATE KEY-----` ile biten bir metin göreceksin.
**BEGIN ve END satırları dahil hepsini** kopyala — bir sonraki adımda
GitHub'a yapıştıracağız. (Bu anahtar yalnızca senin ekranında görünür;
sohbete yapıştırma.)

## Adım 2 — GitHub'a gizli değerleri ekle

Tarayıcıda: **github.com/aieasycep/Masal-m → Settings → Secrets and
variables → Actions → New repository secret**. Sırayla şu kayıtları oluştur
(Name kısmını aynen yaz):

| Name                             | Ne için?                                                                                                                | Value (nereden?)                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `SERVER_SSH_KEY`                 | Sunucuya giriş                                                                                                          | Adım 1'de kopyaladığın anahtar metni       |
| `ANTHROPIC_API_KEY`              | **Claude** — hikâye + güvenlik denetimi + seslendirme yönetmeni                                                         | Adım 7'deki gibi platform.claude.com'dan   |
| `TTS_API_KEY`                    | ElevenLabs seslendirme                                                                                                  | ElevenLabs → API Keys                      |
| `VOICE_CLONE_API_KEY`            | ElevenLabs ses klonlama                                                                                                 | ElevenLabs → aynı anahtar olabilir         |
| `IMAGE_API_KEY`                  | OpenAI görseller (Claude görsel üretmez)                                                                                | platform.openai.com → API keys             |
| `AI_API_KEY`                     | _(isteğe bağlı)_ OpenAI'ye geri dönüş anahtarı                                                                          | platform.openai.com → API keys             |
| `SMOKE_EMAIL` / `SMOKE_PASSWORD` | _(isteğe bağlı)_ `story_smoke` dağıtım testinin kullandığı sabit test hesabı (yoksa her çalıştırmada yeni hesap açılır) | Uygulamada kendin açtığın bir test hesabı  |
| `SMTP_URL` / `MAIL_FROM`         | _(canlıya geçişte)_ Gerçek e-posta: varsa sunucu `MAIL_PROVIDER=smtp` ile çalışır — bkz. `docs/go-live.md` §2           | E-posta servisin (Resend/Brevo) SMTP ayarı |

Aynı sayfanın **Variables** sekmesinde (secret değil, düz değişken) isteğe
bağlı üç kayıt var; hiçbirini eklemezsen bugünkü sslip.io adresi kullanılır:

| Name                   | Ne için?                                                                                                    | Varsayılan             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------- |
| `MASALIM_DOMAIN`       | Alan adı tabanı — `api.`, `storage.`, `admin.` alt alanları bundan türetilir (nginx, sertifika, APK adresi) | `57-129-6-57.sslip.io` |
| `MASALIM_SERVER_HOST`  | Sunucunun IP'si                                                                                             | `57.129.6.57`          |
| `MASALIM_SSH_HOST_KEY` | `ssh-keyscan 57.129.6.57` çıktısındaki `ssh-ed25519` satırı — verilirse dağıtım sunucu kimliğini sabitler   | boş (ilk-güven)        |

> Render'daki değerleri görmek için: dashboard.render.com → masalim-api →
> Environment sekmesi → değerin yanındaki göz simgesi.

## Adım 3 — İlk dağıtımı başlat

GitHub'da: **Actions → Deploy Server → Run workflow → Run workflow** (yeşil
düğme). İlk çalışma 15–25 dakika sürer (sunucu her şeyi sıfırdan derler;
sonraki dağıtımlar birkaç dakikadır). Yeşil biterse her şey hazır demektir —
istersen bu adımı bana da bırakabilirsin ("dağıtımı başlat" demen yeterli,
Adım 1–2 bittiyse ben tetiklerim).

## Adım 4 — Kontrol

- Tarayıcıda https://api.57-129-6-57.sslip.io/health → `"status":"ok"`
  benzeri bir cevap görmelisin.
- https://admin.57-129-6-57.sslip.io → admin paneli açılmalı
  (admin@masalim.local / admin-dev-password-1).

## Adım 5 — Uygulamanın yeni adrese geçmesi (bende)

Sunucu doğrulanınca APK'nın varsayılan API adresini yeni sunucuya çevirip
yeni bir APK derletip emülatörde test ederek linkini vereceğim. Yeni APK'yı
kurunca telefondaki uygulama artık kendi sunucunla konuşur.

Not: Yeni sunucu **boş veritabanıyla** başlar (deneme hikâyelerin Render'da
kalır). Uygulamada yeniden kayıt olman gerekir. Eski deneme verilerinin
taşınmasını istersen söyle, ayrıca yaparız.

## Adım 6 — Render'ı kapatma (en son)

Yeni APK ile birkaç gün her şeyi test ettikten sonra Render'daki
masalim-api / masalim-admin / masalim-db / masalim-redis servislerini
silebilirsin (dashboard.render.com → servis → Settings → Delete). Acele
etme; ikisi bir süre yan yana çalışabilir. UptimeRobot kurduysan artık
gerekmez, silebilirsin.

## Adım 7 — Claude API anahtarı (hikâyeler Claude ile yazılsın)

Hikâye metni, güvenlik denetimi ve seslendirme yönetmeni artık **Claude**
kullanıyor (hikâye: `claude-opus-5-5`, diğer ikisi: `claude-haiku-5-5`).
Görseller Claude ile üretilemez; onlar OpenAI gpt-image-1'de kalır
(`IMAGE_API_KEY`), ama her sayfanın çizim yönergesini artık Claude yazar.

> **Önemli:** claude.ai'daki Max/Pro aboneliğin API'yi KAPSAMAZ. API için
> ayrı bir geliştirici hesabı ve ön ödemeli kredi gerekir. Bir masal yaklaşık
> ₺3–6 tutar (uzunluğa göre); ilk yükleme için 20–40 $ rahat yeter.

1. Tarayıcıda **https://platform.claude.com** → Sign up (claude.ai e-postanla
   girebilirsin; "Claude Developer Platform"/Console hesabı ayrıdır).
2. Sol menüde **Billing** → **Add credits** → kart ekle, 20–40 $ yükle.
   (İstersen _Auto-reload_ kapalı kalsın — kredi bitince hikâye üretimi
   "Sorun oluştu" der, sen yükleyince kendiliğinden düzelir.)
3. Sol menüde **API Keys** → **Create Key** → ad: `masalim-sunucu` → oluştur →
   `sk-ant-...` ile başlayan metni **hemen kopyala** (bir daha gösterilmez).
4. GitHub'da **github.com/aieasycep/Masal-m → Settings → Secrets and
   variables → Actions → New repository secret** → Name: `ANTHROPIC_API_KEY`,
   Value: kopyaladığın anahtar → Add secret. (Anahtarı sohbete/ekran
   görüntüsüne koyma; GitHub ekledikten sonra sana da göstermez, normaldir.)
5. Dağıtım: **Actions → Deploy Server → Run workflow**. İlk adım "LLM
   sağlayıcı anahtarını seç ve doğrula" anahtarı ve model adlarını kontrol
   eder — anahtar yoksa/yanlışsa dağıtım sunucuya dokunmadan Türkçe bir
   hata ile durur (sunucu eski hâlinde çalışmaya devam eder). Yeşil bitince
   hikâyeler Claude'dan gelir.
6. İstersen aynı ekranda **story_smoke** kutusunu işaretle: dağıtım sonunda
   canlı sunucuda gerçek bir KISA masal üretilir ve başlığı/sayfa sayısı
   log'a yazılır (bir masal kadar kredi harcar).

**Geri dönüş (OpenAI'ye):** `.github/workflows/deploy-server.yml` içindeki
`AI_VENDOR: anthropic` satırını `AI_VENDOR: openai` yapıp main'e it — `AI_API_KEY`
secret'ındaki OpenAI anahtarıyla gpt-4o / gpt-4o-mini'ye döner. Model veya
"düşünme derinliği" değiştirmek de aynı dosyada (`ANTHROPIC_STORY_MODEL`,
`ANTHROPIC_EFFORT`: low/medium/high).

---

## Teknik notlar (meraklısına)

- Dosyalar: `deploy/docker-compose.server.yml` (servisler; api/minio/admin
  yalnızca 127.0.0.1:8801-8803'e açılır), `deploy/nginx-masalim.conf`
  (host nginx'ine eklenen üç sanal sunucu — TLS'i certbot işler),
  `deploy/remote-setup.sh` (ilk kurulumda sunucuda sırları üretir),
  `deploy/admin.Dockerfile`, `.github/workflows/deploy-server.yml` (dağıtım:
  rsync → nginx vhost + certbot → compose build/up → sağlık kontrolü).
- Bu sunucuda başka projeler host nginx'i (80/443) üzerinden yayında —
  Masalım o nginx'in ARKASINA yerleşir; dağıtım nginx'i asla restart etmez,
  `nginx -t` başarılıysa yalnızca reload eder.
- Sırlar sunucuda `/opt/masalim/.env` (üretilmiş; git'e girmez) ve
  `/opt/masalim/providers.env` (GitHub Secrets'tan her dağıtımda yazılır;
  LLM sağlayıcı seçimi — `AI_PROVIDER`, `AI_MODEL`, `AI_EFFORT`,
  `MODERATION_*` — ve `TRUST_PROXY=1` (host nginx tek güvenilir vekil; oran
  sınırı/giriş kilidi gerçek istemci IP'sine göre) de buradadır ve
  `.env`'dekini ezer) dosyalarındadır.
- Canlıya geçiş (test modundan çıkış) adımları: `docs/go-live.md`.
- `NODE_ENV=staging`: ödeme/abonelik hâlâ mock (gerçek mağaza kurulumları
  yapılana dek) — üretim modu mock sağlayıcıları bilerek reddeder.
- **Yedekleme (otomatik):** her gece 03:30'da `deploy/backup.sh` çalışır
  (`/etc/cron.d/masalim-backup`, deploy workflow kurar). Veritabanı dökümü
  `/opt/masalim/backups/db/masalim-YYYY-MM-DD.dump`, medya aynası
  `/opt/masalim/backups/media/mirror`, günlük hard-link kopyası
  `media/snapshots/YYYY-MM-DD`; 14 günden eskiler silinir. Log:
  `/var/log/masalim-backup.log`. Elle almak ya da doğrulamak için:
  `sudo /opt/masalim/app/deploy/backup.sh` ve
  `sudo /opt/masalim/app/deploy/backup.sh --check`; GitHub'dan: Deploy Server →
  Run workflow → `run_backup` işaretli. Yedek sunucunun kendi diskindedir —
  sunucu tamamen kaybolursa yedek de gider (dış depo sonraki adım).
- **Yedekten geri dönme:** `sudo docker compose -f
/opt/masalim/app/deploy/docker-compose.server.yml --project-directory
/opt/masalim stop api` → veritabanı:
  `cat /opt/masalim/backups/db/masalim-GÜN.dump | sudo docker compose ... exec -T
postgres pg_restore -U masalim -d masalim --clean --if-exists` → medya:
  `sudo docker compose ... run --rm --no-deps --entrypoint /bin/sh -v
/opt/masalim/backups/media/snapshots/GÜN:/backup:ro minio-init -c 'mc alias set
local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc mirror
--overwrite /backup local/masalim-media'` → `... start api`.
- **Sertleştirme:** api/admin konteynerleri `node` kullanıcısıyla (root değil),
  yetki yükseltme kapalı, api tüm Linux yeteneklerini düşürür ve salt-okunur
  kökle çalışır; postgres/minio yalnızca kendi şifrelerini görür; konteyner
  logları 20 MB × 5 ile sınırlı. Dağıtım sonunda "Dağıtım sonrası doğrulama"
  adımı bunları log'a yazar.
- **MinIO imajı:** MinIO topluluk imajları Ekim 2026'da Docker Hub ve quay.io'dan
  kaldırıldı. Compose dosyasında `minio/minio:latest` + `pull_policy: never` —
  sunucu önbellekteki imajla çalışır, dağıtım yeniden indirmeye çalışmaz. Yeni
  sunucu kurulumu için önce `docs/go-live.md` §9 (yönetilen S3 deposuna geçiş).
- **nginx/certbot:** sanal sunucu şablonu (`deploy/nginx-masalim.conf.tpl`)
  alan adıyla render edilir; render değişmediyse ve sertifika yerindeyse dosyaya
  dokunulmaz. Değiştiyse dosya yazılır ama reload edilmez — TLS bloklarını
  certbot aynı dosyaya işleyip nginx'i kendisi yükler; hata olursa önceki dosya
  geri gelir (HTTPS hiçbir an düşmez).
- GitHub tarafındaki `keepalive.yml` (Render'ı uyanık tutan zamanlanmış ping)
  14 Eylül'de kaldırıldı: Render artık cevap vermediği için her koşu kırmızıya
  düşüyordu ve uygulama zaten VPS'i kullanıyor. Adım 6'da yalnızca Render
  servislerini (ve varsa UptimeRobot'u) silmek kalıyor.
