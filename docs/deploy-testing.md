# Masalım — Ücretsiz Test Sunucusu Kurulumu (teknik bilgi gerektirmez)

Bu rehber, uygulamayı telefonunda **tam işlevsel** test edebilmen için gereken
ücretsiz sunucu kurulumunu adım adım anlatır. Toplam süre: ~15 dakika tıklama +
~10 dakika ilk kurulum beklemesi. Kredi kartı gerekmez.

Kullanılacak servisler:
- **Supabase** (ücretsiz) → dosya deposu (görseller, sesler, PDF'ler)
- **Render** (ücretsiz) → API sunucusu + veritabanı + Redis

---

## 1. Supabase — dosya deposu (5 dk)

1. **supabase.com** → *Start your project* → GitHub hesabınla giriş yap.
2. *New project* → isim: `masalim` → güçlü bir veritabanı şifresi üret (not almana
   gerek yok, kullanmayacağız) → bölge: *Central EU (Frankfurt)* → *Create*.
3. Sol menüden **Storage** → *New bucket* → isim: `masalim-media` →
   "Public bucket" **KAPALI** kalsın → *Create*.
4. Storage sayfasında üstteki **S3 Connection** (veya *Settings → Storage*)
   bölümünü aç. Şu üç değeri bir kenara kopyala:
   - **Endpoint** (örn. `https://abcdefgh.storage.supabase.co/storage/v1/s3`)
   - **Region** (örn. `eu-central-1`)
5. Aynı ekranda **New access key** → isim: `masalim` → oluştur ve şu ikiliyi kopyala:
   - **Access key ID**
   - **Secret access key** (bir kez gösterilir — hemen kopyala)

## 2. Render — API + veritabanı + Redis (5 dk)

1. **render.com** → *Get Started* → GitHub ile giriş yap → Render'ın
   `aieasycep/Masal-m` deposuna erişmesine izin ver.
2. Panelde **New +** → **Blueprint** → depo listesinden `Masal-m`'i seç.
3. Branch olarak **`claude/masalim-implementation-plan-pz1pkl`** seç → *Apply*.
   (Render, repodaki `render.yaml` dosyasını okuyup 3 servisi otomatik kurar:
   `masalim-api`, `masalim-redis`, `masalim-db`.)
4. Kurulum sırasında senden istenen boş alanlara Supabase'den kopyaladıklarını yapıştır:
   - `STORAGE_ENDPOINT` → Supabase Endpoint
   - `STORAGE_REGION` → Supabase Region
   - `STORAGE_ACCESS_KEY` → Access key ID
   - `STORAGE_SECRET_KEY` → Secret access key
   - `API_PUBLIC_URL` → şimdilik boş geç, 6. adımda dolduracağız
5. *Deploy* → ilk derleme ~10 dk sürer. `masalim-api` servisi **Live** olana
   kadar bekle.
6. `masalim-api` servisine tıkla → sayfanın üstündeki adresi kopyala
   (örn. `https://masalim-api.onrender.com`) → *Environment* sekmesi →
   `API_PUBLIC_URL` değerine bu adresi yapıştır → *Save* (servis kendini
   yeniden başlatır).
7. Kontrol: tarayıcıda `https://<senin-adresin>/health` aç →
   `{"status":"ok","db":"up"}` görüyorsan sunucu hazır. 🎉

## 3. APK'yı bu sunucuya bağlı derle (2 dk tıklama + ~15 dk bekleme)

1. **github.com/aieasycep/Masal-m** → üstte **Actions** sekmesi.
2. Sol listeden **Android APK** → sağda **Run workflow** düğmesi.
3. Branch: `claude/masalim-implementation-plan-pz1pkl`; **api_url** kutusuna
   Render adresini yapıştır (örn. `https://masalim-api.onrender.com`) →
   **Run workflow**.
4. ~15-20 dk sonra yeşil ✓ olan derlemeye tıkla → altta **Artifacts** →
   **masalim-apk** indir → zip'ten çıkan `app-release.apk`'yı telefona gönder ve kur.

## 4. Telefonda test

- Uygulama açılır → kayıt ol (herhangi bir e-posta/şifre) → çocuk profili →
  hikâye üret → dinle → görselleştir → kitap yap → sipariş (sahte ödeme).
- Hazır demo hesap: `demo@masalim.local` / `demo-password-1`.
- Tüm yapay zekâ/ödeme sağlayıcıları **mock** modda: anahtar gerekmez, ödeme
  gerçek para çekmez, hikâyeler deterministik örnek içeriktir.

## Bilinen ücretsiz-katman sınırları

- Render ücretsiz servis 15 dk boşta kalınca uyur → ilk istek ~1 dk sürebilir.
- 512MB RAM'de kitap **baskı PDF'i** üretimi bellek sınırına takılabilir;
  takılırsa Render'da *Starter* (~$7/ay) kademesine geçmek yeterli.
- Render ücretsiz Postgres 30 gün sonra sona erer (test için yeterli; kalıcı
  kurulumda ücretli kademe ya da kendi sunucunuz).
- Gerçek yapay zekâ çıktısı istenirse: Render'da `AI_PROVIDER=anthropic` +
  `AI_API_KEY` eklemek yeterli (bkz. `docs/providers.md`).
