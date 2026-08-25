# MASALIM — MEVCUT FIGMA TASARIMINI TAMAMLAMA

Sen bu çalışmada Senior Product Designer, UX Designer ve Mobile UI Designer olarak çalışacaksın.

Bu proje sıfırdan tasarlanmayacak.

Elinde hali hazırda tasarlanmış olan **Masalım** mobil uygulamasının mevcut Figma dosyası bulunmaktadır.

Görevin:

**Mevcut Figma tasarımını değiştirmek, yeniden tasarlamak veya başka bir görsel stile dönüştürmek DEĞİL; mevcut tasarım sistemini birebir takip ederek eksik ekranları, eksik state'leri ve eksik reusable component'leri tamamlamaktır.**

Bu tasarım daha sonra Claude Code tarafından gerçek React Native uygulamasıyla birebir eşleştirilecektir.

Bu nedenle oluşturacağın her ekran:

* developer handoff'a uygun,
* Auto Layout kullanan,
* mevcut component sistemine bağlı,
* mevcut design token'ları kullanan,
* açık isimlendirilmiş,
* state'leri tanımlanmış

olmalıdır.

---

# 1. EN ÖNEMLİ KURAL — MEVCUT TASARIM SOURCE OF TRUTH

Önce mevcut Figma dosyasının tamamını incele.

Şunları analiz et:

* mevcut renk paleti
* typography
* spacing
* card stilleri
* radius
* shadow
* iconography
* button stilleri
* form alanları
* navigation
* bottom navigation
* illustrations
* story cards
* voice cards
* profile cards
* modal / sheet tasarımları
* mevcut empty/loading/error state'leri
* mevcut ekranların layout sistemi

Yeni oluşturacağın hiçbir ekran mevcut uygulamadan bağımsız yeni bir design language oluşturmamalıdır.

Örneğin mevcut uygulamada:

* buton radius 16 ise yeni ekranlarda rastgele 24 kullanma,
* mevcut kart yapısı soft shadow kullanıyorsa farklı sert shadow oluşturma,
* mevcut typography sistemini değiştirme,
* yeni ana renk oluşturma,
* navigation yapısını değiştirme.

**Yeni ekranlar ilk bakışta sonradan eklenmiş gibi görünmemelidir.**

Sanki tüm ekranlar en başından aynı designer tarafından aynı anda tasarlanmış gibi görünmelidir.

---

# 2. MEVCUT EKRANLARI YENİDEN TASARLAMA

Figma'da zaten bulunan ekranları mümkün olduğunca değiştirme.

Önceliğin:

**eksikleri tamamlamak.**

Ancak yeni ekranı mevcut ekrana bağlamak için küçük component/state eklemeleri gerekiyorsa yapabilirsin.

Ana mevcut ekranları baştan tasarlama.

---

# 3. CLAUDE CODE TARAFINDAN EKSİK OLDUĞU BELİRLENEN ALANLAR

Mevcut tasarımın dışında uygulamada ihtiyaç duyulan aşağıdaki ekranlar ve component'ler eksiktir.

Bunların tamamını tasarla.

ÖNCELİK SIRASI önemlidir.

---

# 4. EKSİK EKRAN 1 — AUTH / GİRİŞ VE KAYIT

Mevcut Figma'daki onboarding'in devamı olacak eksiksiz authentication flow oluştur.

## Screen 1 — Auth Welcome

Frame adı:

`Auth/01-Welcome`

Onboarding sonrasında gösterilecek.

İçerik:

Başlık:

**“Masallarına kaldığın yerden devam et.”**

Alt açıklama:

**“Hikâyelerini, seslerini ve çocuk profillerini güvenle saklamak için hesabını oluştur.”**

Authentication seçenekleri:

* Apple ile Devam Et
* Google ile Devam Et
* E-posta ile Devam Et

Alt bölüm:

**“Zaten hesabın var mı? Giriş yap”**

Terms/privacy kısa metni:

**“Devam ederek Kullanım Koşulları'nı ve Gizlilik Politikası'nı kabul etmiş olursun.”**

---

## Screen 2 — E-posta ile Giriş

Frame:

`Auth/02-EmailLogin`

Alanlar:

* E-posta
* Şifre

CTA:

**Giriş Yap**

Secondary:

**Şifremi Unuttum**

Alt:

**Hesabın yok mu? Kayıt Ol**

State'ler:

* default
* focused input
* invalid email
* wrong password
* loading

Error örneği:

**“E-posta veya şifreyi kontrol edip tekrar deneyebilirsin.”**

---

## Screen 3 — Kayıt

Frame:

`Auth/03-Register`

Alanlar:

* Ad
* E-posta
* Şifre
* Şifre tekrar gerekiyorsa uygun UX

CTA:

**Hesap Oluştur**

Alt:

**Zaten hesabın var mı? Giriş Yap**

Validation durumları oluştur.

---

## Screen 4 — Şifremi Unuttum

Frame:

`Auth/04-ForgotPassword`

E-posta alanı.

CTA:

**Sıfırlama Bağlantısı Gönder**

Success state:

`Auth/05-ResetEmailSent`

Başlık:

**“E-postanı kontrol et.”**

---

# 5. EKSİK EKRAN 2 — “HİKÂYEYİ SESLENDİR”

Bu ekran özellikle önemli.

Story Detail içerisinden:

**“Seslendir”**

aksiyonuna basıldığında açılacak.

Frame:

`Narration/01-SelectVoice`

Başlık:

**“Hikâyeyi kim anlatsın?”**

Üstte hikâyenin küçük bilgisi bulunabilir:

* story cover thumbnail
* story title
* estimated duration

Örneğin:

**Ege ve Kayıp Yıldız**
**Yaklaşık 6 dk**

---

## KİŞİSEL SESLER

Section:

**Aile Sesleri**

Hazır bir anne sesi örneği:

* avatar
* “Anne”
* “Annemin Sesi”
* “Hazır”
* play preview butonu
* select indicator

Hazır baba sesi:

aynı yapı.

---

## HAZIRLANIYOR STATE

Bir voice processing durumunda:

**Babanın Sesi**

Status:

**Hazırlanıyor…**

Progress veya subtle loading indicator.

Bu ses henüz seçilememeli.

---

## ERROR STATE

Örneğin:

**Anne'nin Sesi**

**“Ses hazırlanırken bir sorun oluştu.”**

CTA:

**Tekrar Dene**

---

## SES YOKSA

Card:

**Sesimi Oluştur**

Açıklama:

**“Kendi sesinle masalları anlat.”**

CTA:

**Ses Oluştur**

Voice Studio flow'una gider.

---

## SYSTEM VOICES

Section:

**Masal Anlatıcıları**

Örnek:

Duru
“Yumuşak ve sakin”

Atlas
“Sıcak ve güven veren”

Luna
“Masalsı ve huzurlu”

Her birinde:

▶ Preview

bulunsun.

---

## ALT CTA

Bir voice seçildiğinde:

**Bu Sesle Seslendir**

Disabled state de tasarla.

---

# 6. SES PREVIEW BUTONU COMPONENT'İ

Figma'da mevcut değilse yeni reusable component oluştur.

Component:

`VoicePreviewButton`

States:

* idle
* playing
* loading
* disabled

Idle:

▶

Playing:

⏸

gibi sade yaklaşım.

Hem:

* Story Creation / Voice Step
* Voice Studio
* Narration Selection

içinde kullanılabilsin.

---

# 7. EKSİK EKRAN 3 — ÇOCUK PROFİLİ KURULUMU

Onboarding sonrası veya Profil → Çocuklarım alanından erişilebilecek şekilde tasarla.

Frame:

`Child/01-CreateProfile`

Başlık:

**“Masalları kimin için hazırlıyoruz?”**

Alanlar:

### Avatar

Default soft child avatar.

CTA:

**Fotoğraf Ekle**

Fotoğraf opsiyonel olsun.

---

### İsim

Label:

**Çocuğun adı**

Placeholder:

**Örn. Ege**

---

### Yaş

Age selection mümkün olduğunca basit olsun.

Örneğin:

**3 yaş**

veya date picker yerine yaş seçimi kullanılabilir.

---

### İlgi Alanları

Başlık:

**Neleri seviyor?**

Chip seçenekleri:

* Dinozorlar
* Uzay
* Hayvanlar
* Arabalar
* Prensesler
* Deniz
* Doğa
* Robotlar
* Futbol
* Periler
* Macera
* Müzik

Birden fazla seçilebilir.

CTA:

**Profili Oluştur**

---

# 8. ÇOCUK PROFİLİ DÜZENLEME

Frame:

`Child/02-EditProfile`

Create ekranıyla aynı component'leri kullan.

Ek olarak:

**Profili Sil**

destructive action.

Silme işlemi ConfirmSheet açmalı.

---

# 9. ÇOCUK PROFİLLERİ LİSTESİ

Frame:

`Child/03-Children`

Başlık:

**Çocuklarım**

Child cards:

* avatar
* isim
* yaş
* ilgi alanlarından 2–3 chip
* edit affordance

CTA:

**Çocuk Ekle**

---

# 10. EKSİK EKRAN 4 — KİTAP KAPAĞI DÜZENLEME

Mevcut BookBuilder tasarımını koru fakat ayrı bir cover editing ekranı oluştur.

Frame:

`Book/02-CoverEditor`

Gerçek kitap kapağını büyük preview olarak göster.

İçerik:

* AI generated cover illustration
* title
* subtitle
* child name
* dedication

Editable fields:

### Kitap Başlığı

Örn:

**“Ege ve Kayıp Yıldız”**

### Alt Başlık

Örn:

**“Ege için özel bir masal”**

### İthaf

Örn:

**“Anne ve babasından sevgiyle.”**

---

## COVER IMAGE

Aksiyon:

**Kapak Görselini Değiştir**

Alt seçenekler:

* Yeniden Oluştur
* Alternatiflerden Seç

Canvas/Canva benzeri editor oluşturma.

Basit ve otomatik olmalı.

CTA:

**Kapağı Kaydet**

---

# 11. KİTAP ÖNİZLEME

Frame:

`Book/03-Preview`

Amaç:

Kullanıcı baskıdan önce kitabı gerçek kitap gibi görebilsin.

Göster:

* ön kapak
* iç sayfalar
* arka kapak

Page swipe / horizontal navigation.

Subtle physical book mockup kullanılabilir.

CTA:

**Kitabı Bastır**

Secondary:

**Düzenlemeye Dön**

---

# 12. EKSİK EKRAN 5 — SİPARİŞLERİM

Frame:

`Orders/01-List`

Profile → Siparişlerim üzerinden açılır.

Başlık:

**Siparişlerim**

Order card:

* book thumbnail
* book title
* order number
* order date
* order status

Örnek:

**Ege ve Kayıp Yıldız**

**Sipariş #MSL-20482**

Status:

**Hazırlanıyor**

veya:

**Kargoya Verildi**

veya:

**Teslim Edildi**

---

# 13. SİPARİŞ TAKİP

Frame:

`Orders/02-Tracking`

Book thumbnail.

Başlık:

**Ege ve Kayıp Yıldız**

Order number.

Kargo state timeline oluştur:

✓ Sipariş Alındı
✓ Baskıya Hazırlanıyor
✓ Basıldı
● Kargoya Verildi
○ Teslim Edildi

Aktif state mevcut design language'e göre gösterilmeli.

Alt:

Tahmini teslimat.

Kargo firması.

Takip numarası.

CTA:

**Kargoyu Takip Et**

---

# 14. ORDER EMPTY STATE

Frame:

`Orders/03-Empty`

Mesaj:

**“Henüz bir kitap siparişin yok.”**

Alt:

**“Oluşturduğun masalları gerçek bir kitaba dönüştürebilirsin.”**

CTA:

**Hikâyelerime Git**

---

# 15. EKSİK EKRAN 6 — CHECKOUT ADRES

Mevcut Print Order flow'unun ayrı bir adımı olacak.

Frame:

`Checkout/02-Address`

Başlık:

**Teslimat Adresi**

Alanlar:

* Ad Soyad
* Telefon
* İl
* İlçe
* Mahalle
* Adres
* Bina / Daire
* Posta Kodu opsiyonel

Türkiye adres sistemine uygun olsun.

Checkbox:

**Bu adresi daha sonra kullanmak için kaydet**

CTA:

**Devam Et**

Input error state'leri oluştur.

---

# 16. EKSİK EKRAN 7 — AYARLAR

Frame:

`Settings/01-Main`

Navigation list şeklinde.

Sections:

### Hesap

* Hesap Bilgileri
* Çocuklarım
* Seslerim

### Tercihler

* Bildirimler
* Dil
* Ses ve Oynatma

### Gizlilik

* Ses Verilerim
* Gizlilik Politikası
* Kullanım Koşulları
* AI İçerik Bilgilendirmesi

### Hesap

* Çıkış Yap
* Hesabımı Sil

---

# 17. HESAP AYARLARI

Frame:

`Settings/02-Account`

* ad
* e-posta
* profil resmi

Edit edilebilir.

CTA:

**Değişiklikleri Kaydet**

---

# 18. DİL AYARLARI

Frame:

`Settings/03-Language`

Options:

✓ Türkçe
English

MVP'de Türkçe aktif olabilir.

English “yakında” state kullanılabilir veya mevcut localization durumuna göre seçilebilir.

---

# 19. BİLDİRİM AYARLARI

Frame:

`Settings/04-Notifications`

Toggles:

**Hikâyem hazır olduğunda**

**Sesim hazır olduğunda**

**Kitap görselleri hazır olduğunda**

**Sipariş güncellemeleri**

**Yeni özellikler ve öneriler**

---

# 20. SES VERİLERİ

Frame:

`Settings/05-VoiceData`

Anne sesi.

Baba sesi.

Her card:

* ses adı
* created date
* preview
* yeniden kaydet
* sil

Alt bilgi:

**“Ses kayıtların yalnızca izin verdiğin içerikleri oluşturmak için kullanılır.”**

---

# 21. HESABI SİL

Frame veya bottom sheet:

`Settings/06-DeleteAccount`

Başlık:

**“Hesabını silmek istediğine emin misin?”**

Açık şekilde belirt:

* hikâyeler
* çocuk profilleri
* kayıtlı sesler
* kitaplar

silinebilir.

CTA:

**Hesabımı Sil**

Secondary:

**Vazgeç**

Destructive UX kullan.

---

# 22. EKSİK EKRAN 8 — PAYWALL / PREMIUM

Frame:

`Subscription/01-Paywall`

Mevcut uygulamanın sıcak ve premium tasarım dilini devam ettir.

Başlık önerisi:

**“Masallarını daha da özel hale getir.”**

Premium feature list:

✓ Anne ve baba sesiyle anlatım
✓ Daha fazla kişiselleştirilmiş hikâye
✓ Hikâyeleri AI ile resimlendirme
✓ Premium anlatıcı sesleri
✓ Dijital kitap oluşturma
✓ Fiziksel kitaba dönüştürme avantajları

Plan cards:

### Aylık

**₺XXX / ay**

### Yıllık

**₺XXX / yıl**

Badge:

**En Avantajlı**

Pricing placeholder kullan.

Gerçek fiyat uydurma.

CTA:

**Premium'a Geç**

Alt:

**Satın alımları geri yükle**

Legal footer:

**İstediğin zaman iptal edebilirsin.**

---

# 23. PREMIUM FEATURE BLOCKED STATE

Reusable paywall trigger modal/bottom sheet oluştur.

Örneğin kullanıcı premium olmayan hesapla:

**Anne'nin Sesi**

seçerse.

Başlık:

**“Bu özellik Premium'a özel.”**

Açıklama:

**“Masalları kendi sesinle anlatmak için Premium'a geçebilirsin.”**

CTA:

**Premium'u İncele**

Secondary:

**Şimdilik Değil**

Kullanıcı işlem yaptıktan sonra sürpriz paywall görmemeli.

Premium requirement mümkün olduğunca aksiyon öncesinde gösterilmeli.

---

# 24. EKSİK EKRAN 9 — ILLUSTRATION READY

Mevcut Figma'da illustration style ve generation ekranları varsa bunlarla görsel olarak tamamen uyumlu devam et.

Frame:

`Illustration/03-Ready`

Başlık:

**“Masalının resimleri hazır ✨”**

Her story page için mevcut illustration göster.

Kullanıcı bir sayfaya dokunduğunda:

* mevcut görsel
* alternatif görseller

gösterilebilsin.

Aksiyonlar:

**Bu Görseli Kullan**

**Yeniden Oluştur**

**Alternatif Gör**

---

# 25. ILLUSTRATION ALTERNATIVES

Frame veya bottom sheet:

`Illustration/04-Alternatives`

Aynı sahne için 3–4 alternative thumbnail.

Selected state.

CTA:

**Seçimi Kaydet**

---

# 26. ILLUSTRATION REGENERATING STATE

Frame/state:

`Illustration/05-Regenerating`

Mevcut görsel tamamen kaybolmasın.

Üzerinde veya altında:

**“Yeni bir seçenek hazırlanıyor…”**

gibi subtle loading.

Kullanıcının önceki görseli güvende hissettirilmeli.

---

# 27. REUSABLE COMPONENT — CONFIRM SHEET

Component:

`Sheet/Confirm`

Bottom sheet olarak tasarla.

Kullanılacak yerler:

* Story silme
* Voice silme
* Child profile silme
* Account silme
* Book değişikliği iptal etme

Props / variants düşün:

### Neutral

**“Değişikliklerden vazgeçmek istediğine emin misin?”**

### Destructive

**“Bu hikâyeyi silmek istediğine emin misin?”**

Buttons:

Primary/Destructive action

Secondary/Cancel

---

# 28. CHILD SWITCHER BOTTOM SHEET

Component:

`Sheet/ChildSwitcher`

Ana sayfadaki selected child avatar/name'e basılınca açılabilir.

Başlık:

**“Çocuk seç”**

Child rows:

✓ Ege
Ada
Deniz

Her row:

* avatar
* name
* age

Alt CTA:

**Yeni Çocuk Ekle**

---

# 29. EMPTY STATE COMPONENT

Reusable:

`State/Empty`

Props:

* illustration/icon
* title
* description
* primary action
* optional secondary action

Examples oluştur:

### Library Empty

**“İlk masalın burada yaşayacak.”**

CTA:

**İlk Hikâyemi Oluştur**

### Voices Empty

**“Masallar henüz senin sesini tanımıyor.”**

CTA:

**Sesimi Oluştur**

### Orders Empty

**“Henüz kitap siparişin yok.”**

---

# 30. ERROR STATE COMPONENT

Reusable:

`State/Error`

Variants:

* network
* server
* generation
* payment
* voice
* illustration

Örnek:

**“Bir şeyler yolunda gitmedi.”**

**“Bağlantını kontrol edip tekrar deneyebilirsin.”**

CTA:

**Tekrar Dene**

Teknik hata kodlarını kullanıcıya gösterme.

---

# 31. LOADING STATE COMPONENT

Reusable:

`State/Loading`

Ancak tüm loading'leri aynı spinner olarak tasarlama.

Variants:

* page
* list
* card
* AI generation
* audio
* image

Story list gibi içeriklerde skeleton kullan.

AI generation'da mevcut masalsı görsel dili kullan.

---

# 32. PREMIUM / QUOTA BANNERS

Reusable component:

`Banner/Quota`

Örnek:

**“Bu ay 3 masal hakkın kaldı.”**

Action:

**Premium'u Gör**

---

Reusable:

`Badge/Premium`

Premium özelliklerde kullanılabilir.

Ancak UI'nın her tarafını Premium badge ile doldurma.

---

# 33. STORY QUOTA EXHAUSTED

Bir state oluştur:

`Subscription/02-QuotaReached`

Başlık:

**“Bu ayki ücretsiz masal hakkını kullandın.”**

Açıklama:

**“Premium ile daha fazla hikâye oluşturabilirsin.”**

CTA:

**Premium'u İncele**

Secondary:

**Daha Sonra**

---

# 34. AUDIO PREVIEW COMPONENT

Reusable:

`Audio/PreviewButton`

States:

* Default
* Loading
* Playing
* Paused
* Disabled
* Error

Hem parent voice hem system voice ile çalışacak görünüm tasarla.

Player çok büyük olmamalı.

Kullanıcı tek dokunuşla:

**▶**

ses örneğini dinleyebilmeli.

---

# 35. GENERIC LIST ROW

Settings ve Profile gibi alanlarda tekrar kullanılabilecek:

`ListRow/Navigation`

oluştur.

İçerik:

* optional leading icon
* title
* optional subtitle
* optional badge
* trailing chevron

Variants:

* default
* toggle
* destructive
* disabled

---

# 36. FORM COMPONENT STATES

Mevcut input component'lerinde eksikse mutlaka tamamla.

States:

* default
* focused
* filled
* disabled
* error
* success

Multiline textarea.

Select.

Phone field.

Search.

---

# 37. SCREEN STATES

Özellikle aşağıdaki ekranlar için yalnızca happy path çizme.

Minimum:

### Auth

* default
* loading
* error

### Child

* populated
* empty

### Narration

* voices ready
* voice processing
* voice error
* no custom voices

### Orders

* populated
* empty

### Illustration

* ready
* regenerating
* error

### Library

* populated
* empty
* loading
* network error

oluştur.

---

# 38. PROTOTYPE FLOWS

Yeni ekranları mevcut prototype'a bağla.

## AUTH FLOW

Onboarding
→ Auth Welcome
→ Google / Apple veya Email
→ Register
→ Child Profile
→ Home

---

## CHILD FLOW

Home Child Selector
→ Child Switcher Sheet
→ Select Child

ve:

Profile
→ Children
→ Add Child
→ Save

---

## NARRATION FLOW

Story Detail
→ Seslendir
→ Select Voice
→ Preview Voice
→ Select
→ Generate Narration

Custom voice yoksa:

Select Voice
→ Sesimi Oluştur
→ mevcut Voice Studio flow

---

## BOOK FLOW

Book Builder
→ Cover Editor
→ Preview
→ Print Order

---

## ORDER FLOW

Physical Book
→ Configuration
→ Address
→ Payment / Review
→ Success
→ Orders
→ Tracking

---

## SETTINGS FLOW

Profile
→ Settings
→ Account / Language / Notifications / Voice Data

---

## PREMIUM FLOW

Premium locked feature
→ Premium Sheet
→ Paywall

---

## ILLUSTRATION FLOW

Generate Illustrations
→ Ready
→ Page
→ Alternatives
→ Select / Regenerate
→ Book Builder

---

# 39. FIGMA PAGE ORGANIZATION

Yeni ekranları mevcut page yapısına entegre et.

Gerekirse aşağıdaki sections oluştur:

`Auth`

`Children`

`Narration`

`Book`

`Orders`

`Checkout`

`Settings`

`Subscription`

`Illustration States`

`Global States`

---

# 40. FRAME NAMING

Kesinlikle:

`Frame 123`

gibi isimler kullanma.

Örneğin:

```text
Auth/01-Welcome
Auth/02-EmailLogin
Auth/03-Register
Auth/04-ForgotPassword

Child/01-CreateProfile
Child/02-EditProfile
Child/03-Children

Narration/01-SelectVoice
Narration/02-Generating
Narration/03-Success

Book/02-CoverEditor
Book/03-Preview

Orders/01-List
Orders/02-Tracking
Orders/03-Empty

Checkout/02-Address

Settings/01-Main
Settings/02-Account
Settings/03-Language
Settings/04-Notifications
Settings/05-VoiceData
Settings/06-DeleteAccount

Subscription/01-Paywall
Subscription/02-QuotaReached

Illustration/03-Ready
Illustration/04-Alternatives
Illustration/05-Regenerating
```

kullan.

---

# 41. COMPONENT NAMING

Örnek:

```text
Sheet/Confirm
Sheet/ChildSwitcher

State/Empty
State/Error
State/Loading

Banner/Quota

Badge/Premium

Audio/PreviewButton

ListRow/Navigation

Card/Order
Card/Child
Card/Voice

Timeline/OrderTracking
```

Component variants kullan.

---

# 42. AUTO LAYOUT

Bütün yeni ekran ve component'lerde Auto Layout kullan.

Responsive olmayan manuel layer yerleşiminden mümkün olduğunca kaçın.

Mevcut spacing token'larını kullan.

---

# 43. MOBILE DIMENSIONS

Mevcut Figma mobile frame ölçüsünü takip et.

Eğer ana tasarım:

390 × 844

ise aynı frame ölçüsünü kullan.

Safe area'ları koru.

Bottom tab olan ekranlarda mevcut bottom navigation component'ini kullan.

---

# 44. GERÇEK TÜRKÇE İÇERİK KULLAN

Lorem Ipsum kullanma.

UI'nın tamamında gerçek Türkçe metinler kullan.

Tone:

* sıcak
* sade
* ebeveyn odaklı
* güven veren
* premium
* duygusal fakat abartısız

---

# 45. YENİ İLLÜSTRASYON STİLİ UYDURMA

Yeni ekranlarda illustration gerekiyorsa mevcut Figma'daki illustration art direction'ını takip et.

Yeni farklı bir:

* 3D style
* cartoon style
* gradient style

oluşturma.

---

# 46. CLAUDE CODE HANDOFF KRİTİK

Bu Figma dosyası doğrudan Claude Code'a verilecek.

Dolayısıyla tüm ekranları implement edilebilir şekilde tasarla.

Claude Code'un şu an kendi tahminiyle oluşturduğu eksik ekranların yerine bu yeni Figma ekranları kullanılacak.

Bu nedenle:

* bütün component'ler isimlendirilmiş olsun,
* state'ler ayrı variants olsun,
* button states görünür olsun,
* inputs component olsun,
* modallar ve sheets component olsun,
* renkler token'lardan gelsin,
* typography styles merkezi olsun,
* Auto Layout kullanılsın.

---

# 47. ÖNEMLİ: CLAUDE'UN MEVCUT TASARIMINI REFERANS ALMA

Claude Code Figma'da bulunmayan bazı ekranları kendisi yorumlayarak uygulamaya eklemiş olabilir.

Bu ekranları source of truth kabul etme.

**Source of truth mevcut Figma design language'dir.**

Yeni eksik ekranları önce sen tasarla.

Daha sonra Claude Code bu ekranlara göre kendi implementasyonunu değiştirecek.

---

# 48. TESLİM ÖNCESİ DESIGN QA

İş bittikten sonra tüm yeni ekranları mevcut Figma ekranlarının yanına koyarak kontrol et.

Şunların tutarlı olduğundan emin ol:

* typography
* button height
* icon size
* card radius
* horizontal padding
* vertical rhythm
* background colors
* shadow
* navigation
* illustrations
* sheets
* input styles

Yeni ekranlar “sonradan yapılmış” gibi görünüyorsa düzelt.

---

# 49. SON ÇIKTI

Bu görev sonunda:

### Yeni ekranlar

Minimum şu ekranlar tamamlanmış olmalı:

1. Auth Welcome
2. Email Login
3. Register
4. Forgot Password
5. Hikâyeyi Seslendir / Voice Selection
6. Child Create
7. Child Edit
8. Children List
9. Book Cover Editor
10. Book Preview
11. Orders List
12. Order Tracking
13. Address
14. Settings Main
15. Account Settings
16. Language
17. Notifications
18. Voice Data
19. Delete Account
20. Paywall
21. Illustration Ready
22. Illustration Alternatives
23. Illustration Regenerating

### Yeni veya tamamlanan component'ler

* ConfirmSheet
* ChildSwitcher Sheet
* Empty State
* Error State
* Loading State
* Quota Banner
* Premium Badge
* Audio Preview Button
* Order Card
* Order Tracking Timeline
* Settings List Row
* gerekli form states

oluşturulmuş olmalıdır.

Amaç mevcut Masalım Figma tasarımını yeniden yapmak değil:

**mevcut tasarım sistemini koruyarak eksiksiz, production-ready ve Claude Code'un birebir implemente edebileceği bir tasarım dosyasına dönüştürmektir.**

Şimdi önce mevcut Figma dosyasını analiz et.

Mevcut design system'i ve component yapılarını tespit et.

Ardından yalnızca yukarıda belirtilen eksik ekranları ve component'leri mevcut tasarım diliyle tamamla.
