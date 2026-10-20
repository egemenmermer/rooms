# Sürüm oluşturma ve dağıtma

[← README](../README.md) · [Geliştirme](DEVELOPMENT.md) · [Sunucu kurulumu](SELF_HOSTING.md)

## İçindekiler

- [Kaynak kod ve kurulum dosyaları](#kaynak-kod-ve-kurulum-dosyaları)
- [Geliştirme paketleri](#geliştirme-paketleri)
- [Güvenilir Mac sürümü](#güvenilir-mac-sürümü)
- [Güncelleme ve yayınlama](#güncelleme-ve-yayınlama)
- [Yayın kontrol listesi](#yayın-kontrol-listesi)

## Kaynak kod ve kurulum dosyaları

Depo herkese açıktır; özgün Tayfa kodu MIT lisanslıdır. Hazır masaüstü paketleri [GitHub sürümlerinde](https://github.com/egemenmermer/rooms/releases/latest) yayımlanır. Kaynağı veya paketi indirmek topluluğa üyelik ve hazır hesap sağlamaz; yöneticinin sunucu adresi ve daveti gerekir. Kendi topluluğunu dağıtan kişi kendi uyumlu paketini ve davetlerini yönetir.

Git etiketi kaynağı tanımlar. Tek başına indirilebilir uygulamanın imzalı, noter onaylı veya test edilmiş olduğunu kanıtlamaz. Özel topluluk arşivlerini ve incelenmemiş geçmiş dosyaları herkese açık paket olarak yeniden dağıtma.

## Geliştirme paketleri

[Geliştirme araçlarını](DEVELOPMENT.md) kurduktan sonra:

```sh
pnpm package:mac
# Veya uygun Windows paketleme ortamında:
pnpm package:win
```

`release/` altında Mac için ad-hoc, Windows için imzasız geliştirme paketleri oluşur. Proje sahibinin üretim kimlik bilgileri gerekmez. Yerel derleme, ön kontroller ve platform araçları yine başarılı olmalıdır.

## Güvenilir Mac sürümü

Dağıtıcı kendi yapılandırmasını sağlar:

| Değişken | Amaç |
| --- | --- |
| `ROOMS_SIGNING_IDENTITY` | Developer ID Application kimliği |
| `APPLE_TEAM_ID` | Apple geliştirici takımı |
| `ROOMS_NOTARY_KEYCHAIN_PROFILE` | Yapılandırılmış noter profili; desteklenen açık noter kimlik bilgileri alternatif olabilir |
| `ROOMS_SPARKLE_PUBLIC_KEY` | Özel güncelleme imza anahtarına karşılık gelen base64 açık anahtar |
| `ROOMS_UPDATE_FEED` | Sonu `/` olan HTTPS güncelleme besleme tabanı |
| `ROOMS_RELEASE_OUTPUT` | İsteğe bağlı çıktı yolu; ön kontrol disk alanını ölçer |

Sparkle özel anahtarını `generate_appcast` kullanan korumalı imzalama hesabında tut. Açık doğrulama anahtarı dağıtılmak içindir; özel anahtar değildir. Proje sahibinin Keychain'ini veya sağlayıcı oturumunu kopyalama.

```sh
pnpm release:mac
```

Yayımlamadan aday oluşturur, imzalar ve noter sürecini çalıştırır. Dağıtımdan önce Apple sonucunun `Accepted` olması, biletlerin pakete eklenmesi ve Gatekeeper kontrolü gerekir. Paketleme aracının kendi noter adımını atlaması, ayrı `notarytool` adımının tamamlandığı anlamına gelmez; nihai sonucu kontrol et.

Windows geliştirme paketlemesi ayrıdır. Mevcut arkadaş EXE'leri imzasızdır; bu rehber tamamlanmış güvenilir Windows imza zinciri iddiası taşımaz. Yerel kaynak, lisans ekleri ve gerçek paket kontrolleri her platform için korunmalıdır.

## Güncelleme ve yayınlama

Mac uygulama içi güncellemesi, dağıtıcının uyumlu anahtarı ve beslemesi ve doğru imzalı dosyalarıyla Sparkle üzerinden çalışır. Kaynak derlemesi başkasının kanalına otomatik katılmaz. Windows/yerel paket ve güncelleme kabulü hedef derlemede ayrı incelenir; mevcut Windows dağıtımı yeni EXE'nin elle kurulmasını kullanır.

```sh
pnpm release:mac:publish
```

**Bu komut dosyaları yayımlar; doğrulama komutu değildir.** Ayrıca `ROOMS_DEPLOY_HOST`, `ROOMS_DEPLOY_KEY`, `ROOMS_DEPLOY_KNOWN_HOSTS` ve `ROOMS_UPDATE_REMOTE_DIR` ister. En az yetkili dağıtım hesabını kullan; SSH sunucu doğrulaması sıkı kalır. Kendi yapılandırmanla çalıştırmadan yayın betiklerini oku.

Besleme adresi ile arşiv indirme adresinin ömrünü ayır. Güncel besleme sabit bir adreste bulunabilir; arşivi sürüme özel, değişmeyen dosyaya yönlendir. Mevcut imzalı appcast kaydının altındaki arşivi farklı baytlarla değiştirme. Eski sürümden gerçek güncelleme, profilin korunması ve uyumlu geri dönüş denenmelidir. Beslemenin doğru görünmesi, eski istemcinin yeni sürümü gerçekten sunduğu kanıtı değildir.

## Yayın kontrol listesi

- Sürüm/build, kaynak SHA, dosya özetleri ve hedef platform/mimari kaydedilir.
- Aynı kaynakta temel kontroller ve yerel açılış başarılıdır.
- Temel giriş/sohbet/medya, kendi arka ucunda gerçek cihazlarla denenir; açık kabul konuları belirtilir.
- Yapılandırma/veri biçimi uyumluluğu incelenir; yedek izole ortamda geri yüklenir.
- Paket özel dosya, oturum, anahtar ve kişisel medya için incelenir; [paket politikası](publication/PACKAGE_POLICY.md) uygulanır.
- Lisanslar, üçüncü taraf bildirimleri ve gereken karşılık gelen yerel kaynak ekleri eklenir.
- Dağıtılan gerçek dosyanın imza/noter/güven kontrolleri tamamlanır.
- Temiz kurulum, desteklenen önceki sürümden güncelleme ve kurtarma/geri dönüş denenir.
- Yalnız incelenen baytlar yüklenir; uzaktaki boyut ve özet doğrulanır.
- Dosyalar yerleşmeden katalog/feed etkinleştirilmez. Önceki kayıtlar ve geri dönüş paketi korunur.
- Sürüm, platformlar, sınırlamalar ve destek yolu açıkça yazılır.

Herkese açık kaynak hazırlığı ve CI tek başına yayın imzalamaz, dağıtım yapmaz veya fiziksel kabulü tamamlamaz. Arkadaş test sürümünün açık kontrollerini herkese açık V1 tamamlanmış gibi sunma.
