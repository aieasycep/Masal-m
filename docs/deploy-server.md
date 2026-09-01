# Masalım — Kendi Sunucuna Kurulum (OVH VPS, adım adım)

Bu rehber Masalım'ın canlı ortamını Render yerine kendi sunucunda
(57.129.6.57, Ubuntu) çalıştırmak içindir. Kurulduktan sonra:

- API, veritabanı (PostgreSQL), Redis ve medya deposu (MinIO) **tek sunucuda**
  çalışır — uyku moduna geçme / soğuk açılış sorunu **tamamen biter**.
- Her `main` güncellemesi GitHub Actions ile sunucuya **otomatik** yüklenir.
- HTTPS sertifikaları (Let's Encrypt) otomatik alınır ve yenilenir.

Adresler (kurulum sonrası):

| Servis | Adres |
|---|---|
| API | https://api.57-129-6-57.sslip.io/health |
| Admin paneli | https://admin.57-129-6-57.sslip.io |
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
curl -fsSL https://get.docker.com | sudo sh
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

Ekranın sonunda `-----BEGIN OPENSSH PRIVATE KEY-----` ile başlayıp
`-----END OPENSSH PRIVATE KEY-----` ile biten bir metin göreceksin.
**BEGIN ve END satırları dahil hepsini** kopyala — bir sonraki adımda
GitHub'a yapıştıracağız. (Bu anahtar yalnızca senin ekranında görünür;
sohbete yapıştırma.)

## Adım 2 — GitHub'a 5 gizli değer ekle

Tarayıcıda: **github.com/aieasycep/Masal-m → Settings → Secrets and
variables → Actions → New repository secret**. Sırayla şu 5 kaydı oluştur
(Name kısmını aynen yaz):

| Name | Value (nereden?) |
|---|---|
| `SERVER_SSH_KEY` | Adım 1'de kopyaladığın anahtar metni |
| `AI_API_KEY` | Render → masalim-api → Environment → AI_API_KEY değeri |
| `TTS_API_KEY` | Render → masalim-api → Environment → TTS_API_KEY değeri |
| `VOICE_CLONE_API_KEY` | Render → aynı yerden |
| `IMAGE_API_KEY` | Render → aynı yerden |

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

---

## Teknik notlar (meraklısına)

- Dosyalar: `deploy/docker-compose.server.yml` (servisler),
  `deploy/Caddyfile` (HTTPS + yönlendirme), `deploy/remote-setup.sh`
  (ilk kurulumda sunucuda sırları üretir), `deploy/admin.Dockerfile`,
  `.github/workflows/deploy-server.yml` (dağıtım).
- Sırlar sunucuda `/opt/masalim/.env` (üretilmiş; git'e girmez) ve
  `/opt/masalim/providers.env` (GitHub Secrets'tan her dağıtımda yazılır)
  dosyalarındadır.
- `NODE_ENV=staging`: ödeme/abonelik hâlâ mock (gerçek mağaza kurulumları
  yapılana dek) — üretim modu mock sağlayıcıları bilerek reddeder.
- Yedekleme: veritabanı `postgres-data`, medya `minio-data` Docker
  volume'larındadır. Basit yedek almak için sunucuda:
  `docker exec masalim-postgres-1 pg_dump -U masalim masalim > yedek.sql`
  (otomatik yedekleme istersen kurarım).
- GitHub tarafındaki `keepalive.yml` Render uykusu içindi; Render
  kapatılınca kaldırılacak.
