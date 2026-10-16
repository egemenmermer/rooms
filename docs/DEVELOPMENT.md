# ROOMS geliştirme ve derleme rehberi

[← README](../README.md) · [Mimari](ARCHITECTURE.md) · [Sunucu kurulumu](SELF_HOSTING.md)

## İçindekiler

- [Araç zinciri](#araç-zinciri)
- [İlk çalıştırma](#i̇lk-çalıştırma)
- [Komutlar](#komutlar)
- [Masaüstü paketi oluştur](#masaüstü-paketi-oluştur)
- [Kaynak düzeni](#kaynak-düzeni)
- [Güvenli geliştirme](#güvenli-geliştirme)
- [Doğrulama seviyeleri](#doğrulama-seviyeleri)

## Araç zinciri

| Araç | Sürüm veya amaç |
| --- | --- |
| Node.js | 22.22.0 |
| pnpm | 11.25.0; `package.json` içinde sabit |
| Git | Kaynak kodu almak ve sürümü izlemek |
| Xcode Command Line Tools | Mac yerel derleme; gerekiyorsa `xcode-select --install` |
| Docker Compose | Stoat geliştirme kurulumu; yalnızca istemci bağımlılıklarını yüklemek için şart değil |
| Java 17+ ve Maven | İsteğe bağlı sunucu YouTube köprüsü |
| Playwright tarayıcısı/runtime | Yalnızca ilgili testler ve ekran yakalama araçları |

Sabit kilit dosyasını kullan. Kurulum için proje sahibinin API anahtarına, imza sertifikasına veya ortak hesabına ihtiyaç yoktur. Yapılandırılmış masaüstü paket hedefleri macOS 14+ Apple Silicon ve Windows x64'tür; Linux masaüstü paketi vaat edilmez.

## İlk çalıştırma

```sh
git clone https://github.com/egemenmermer/rooms.git
cd rooms
pnpm install --frozen-lockfile
```

macOS/Linux kabuğunda:

```sh
ROOMS_PROFILE=dev-contributor pnpm dev
```

Windows PowerShell'de:

```powershell
$env:ROOMS_PROFILE = 'dev-contributor'
pnpm dev
```

Geliştirme komutu Electron main/preload'u derler, Vite'ı loopback 5173 portunda başlatır ve Electron'ı açar. Kurulu uygulamanın tercihlerini değiştirmemek için ayrı profil kullan. Kendi geliştirme oturumunu Ctrl+C ile durdur.

İstemcinin hazır üretim sunucusu adresi yoktur. Kendi topluluk adresini gir veya davetini aç. İstemciyi başlatmak hesap, veritabanı veya ses sunucusu kurmaz; bunun için [sunucu rehberini](SELF_HOSTING.md) izle.

İsteğe bağlı, gizli olmayan `VITE_ROOMS_DEFAULT_SERVER`, özelleştirilmiş dağıtımda sunucuyu **derleme sırasında** önceden doldurabilir. Yerel değerleri Git'in yok saydığı `.env.local` içinde tut. `VITE_` değişkenine parola veya belirteç koyma; değer görünüm süreci paketine girebilir.

## Komutlar

Depo kökünden çalıştır:

| Komut | Amaç |
| --- | --- |
| `pnpm dev` | Yerel Electron geliştirme uygulaması ve Vite |
| `pnpm dev:web` | Tarayıcıda arayüz geliştirme; yerel yakalama, kimlik bilgisi deposu veya doğrulanmış ses sağlamaz |
| `pnpm lint` | ESLint kontrolü |
| `pnpm typecheck` | TypeScript kontrolü |
| `pnpm test` | Vitest testleri |
| `pnpm build` | Tip kontrolü, görünüm süreci, bildirimler ve Electron derlemesi |
| `pnpm services:build` | Erişim, Activities, Agent, müzik ve mevcut sunucu servislerinin derlemesi |
| `pnpm start` | Önceden derlenmiş uygulamayı çalıştır; önce `pnpm build` |
| `pnpm test:desktop --grep 'desktop shell'` | Sınırlı yerel açılış kontrolü |
| `pnpm e2e:stack up` / `pnpm e2e` | Atılabilir yerel sunucuda gerçek istemcilerle uçtan uca test; [rehber](E2E_TESTING.md) |
| `pnpm verify:ci` | Lint, tip, test, istemci ve servis derleme temel kontrolü |
| `pnpm format:check` | Mevcut kod/araç biçimlendirme kontrolü |

Her `verify-*` betiğini gelişigüzel çalıştırma. Bazıları yetkili hesap, çalışan servis, özel dosya, platform izni veya sağlayıcı erişimi ister. [Araç kategorilerini](../scripts/README.md) ve ilgili betiği önce oku.

## Masaüstü paketi oluştur

```sh
pnpm package:mac
```

Uygun Mac'te ad-hoc Apple Silicon geliştirme paketi oluşturur. Yerel araçlar ve yayın ön kontrolü başarılı olmalıdır. Bu işlem Developer ID imzası ve noter onayı değildir.

```sh
pnpm package:win
```

İmzasız Windows x64 geliştirme kurulumu oluşturur. Hedef platform kabulü için uygun Windows paketleme ortamı kullan. Çıktı varsayılan olarak Git'in yok saydığı `release/` klasöründedir.

VLC ve uzak giriş gibi yerel özelliklerde ilgili hazırlama komutları, Windows'ta Visual Studio x64 derleyicisi ve platforma uygun bağımlılıklar ayrıca gerekir. Genel kaynak derlemesi bu özelliklerin fiziksel kabulü değildir; ilgili özellik belgelerini oku.

Güvenilir dağıtım, ayrı [yayın sürecini](RELEASING.md), dağıtıcının kendi imza kimliğini ve gerçek kurulum/güncelleme kontrollerini gerektirir. İmzasız geliştirme dosyasını resmî güvenilir yayın olarak tanıtma.

## Kaynak düzeni

| Yol | Sorumluluk |
| --- | --- |
| `apps/desktop/src/` | React kabuğu, özellik ekranları, görünüm süreci durumu |
| `apps/desktop/electron/` | Yerel oturum, dosya, cihaz, yakalama ve güncelleme yetkisi |
| `apps/distribution/` | İsteğe bağlı davetli indirme portalı |
| `apps/services/access/` | Kayıt, kimlik/izin kontrolü ve medya yetkileri |
| `apps/services/activities/` | Yetkili etkinlik durumu ve kalıcılık |
| `apps/services/music/` | İsteğe bağlı müzik servisi ve kaynak köprüleri |
| `apps/services/agent/` | İsteğe bağlı izole görevler ve izinler |
| `apps/services/hostops/` | Sunucu yönetiminin ilgili servis sınırı |
| `packages/` | Ortak alan, protokol, şema, bağdaştırıcı ve kurallar |
| `infra/` | Genel kurulum şablonları ve üst sistem sürüm sabitlemeleri |
| `scripts/` | Derleme, kurulum, yayın ve kapsamlı olmayan doğrulama yardımcıları |
| `tests/` | Bileşen, protokol, loopback ve yerel regresyonlar |
| `tooling/aliases.ts` | `tsconfig.json` üzerinden alias üretimi |
| `docs/` | Kullanıcı, yönetici ve katkıcı belgeleri |

Paketler aynı araç zincirindeki mantıksal kaynak modülleridir; bağımsız npm paketleri olarak yayımlanmazlar. Değişikliği ilgili modülde başlat ve süreçler arasındaki tipli sözleşmeleri koru. [Mimariye](ARCHITECTURE.md) bak.

Üretilen veriler Git'in yok saydığı `.local/`, `dist*`, `release/` ve test çıktı klasörlerinde kalır. `ROOMS_REFERENCE_ROOT`, sahibi olduğun haricî referans varlık paketi için isteğe bağlıdır; üretim bağımlılığı değildir.

## Güvenli geliştirme

Kimlik doğrulamalı geliştirmede atılabilir hesaplar ve izole ortamlar kullan. Operatörden üretim oturumu, sağlayıcı hesabı veya imzalama Keychain'i isteme. Yetkili kimlik bilgileri görünüm süreci veya ekran görüntüsünde değil, yerel/sunucu sınırında kalmalı.

Geliştirme görsel örnekleri üretim yollarına dahil edilmez. README galerisi örnek topluluk verileri kullanır; sunumu canlı arka uç kanıtı sayılmaz. Örnek köprü davranışını paketleme veya çalışma anındaki geliştirme etiketini ürün değişikliği olarak kaldırma.

[Katkı rehberini](../CONTRIBUTING.md) izle; yalnız biçimlendirme yapan değişiklikleri ayır. Yerel sırları, hesap örneklerini, veritabanı kopyalarını veya özel operasyon kanıtlarını commit etme. Proje belgeleri ve README Türkçe tutulur; komutlar, API/ayar adları ve kod tanımları çevrilmez.

## Doğrulama seviyeleri

1. **Kaynak kontrolleri:** lint, tip, birim/bileşen testleri ve derleme.
2. **Yerel açılış kontrolü:** Electron açılır ve sınırlı kabuk davranışı çalışır.
3. **Servis entegrasyonu:** yapılandırılmış arka uçta gerçek hesaplar, ağ geçidi, izinler, kalıcılık ve kurtarma. Yerelde [uçtan uca test paketi](E2E_TESTING.md) bu seviyeyi atılabilir bir yığında otomatik sınar.
4. **Fiziksel cihaz kabulü:** iki bilgisayar, gerçek mikrofon/kamera/ekran izinleri, duyulan ses ve güncelleme kurulumu.

Her seviye farklı bir olguyu kanıtlar. İki taklit istemci gerçek medya oturumunu; başarılı kaynak derlemesi imzalı kurulumu kanıtlamaz. PR'da ortamı/sürümü ve açık kalan kontrolleri dürüstçe kaydet.
