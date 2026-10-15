# Sorun giderme ve sık sorulanlar

[← README](../README.md) · [Kullanım rehberi](USER_GUIDE.md) · [Sunucu kurulumu](SELF_HOSTING.md)

## İçindekiler

- [Uygulamayı nereden indirebilirim?](#uygulamayı-nereden-indirebilirim)
- [Herkesin sunucu kurması gerekiyor mu?](#herkesin-sunucu-kurması-gerekiyor-mu)
- [Uygulama açılıyor ama bağlanmıyor](#uygulama-açılıyor-ama-bağlanmıyor)
- [Davet çalışmıyor](#davet-çalışmıyor)
- [Ses bağlanıyor ama duyulmuyor veya paylaşım çalışmıyor](#ses-bağlanıyor-ama-duyulmuyor-veya-paylaşım-çalışmıyor)
- [Etkinlikler veya müzik kullanılamıyor](#etkinlikler-veya-müzik-kullanılamıyor)
- [Güncelleme kullanılamıyor](#güncelleme-kullanılamıyor)
- [Derleme ve kurulum sorunları](#derleme-ve-kurulum-sorunları)
- [Yararlı hata bildirimi](#yararlı-hata-bildirimi)

## Uygulamayı nereden indirebilirim?

[Güncel GitHub sürümünü](https://github.com/egemenmermer/rooms/releases/latest) açıp platformuna uygun DMG veya EXE'yi seç. Sürüm notlarında imza ve platform durumunu kontrol et. Sunucu adresi ve davet için topluluk yöneticine başvur. Kaynak etiketleri ve kaynak ZIP'leri uygulama kurulum dosyası değildir. Kendi derlemen için [geliştirme rehberini](DEVELOPMENT.md) izle.

## Herkesin sunucu kurması gerekiyor mu?

Hayır. Bir yönetici topluluğun arka ucunu çalıştırır. Üyeler masaüstü istemcisini kurup o sunucuya katılır. Farklı sunucuların hesap ve verileri ayrıdır; hazır evrensel hesap hizmeti veya kişisel sunucu varsayılanı yoktur.

## Uygulama açılıyor ama bağlanmıyor

**Üye:** seçilen sunucu adresini, interneti ve hesabını kontrol et. Arka ucun çalışıp çalışmadığını yöneticiye sor. `pnpm dev`, sunucu kümesini değil masaüstü geliştirme istemcisini başlatır.

**Yönetici:** Stoat'ın duyurduğu herkese açık API/websocket adresini, ters vekil rotalarını, TLS sertifikasını ve erişim servisini doğrula. Tek bir servisten başarılı `/health` yanıtı almak hesapların, izinlerin ve medyanın uçtan uca çalıştığını kanıtlamaz. Loopback adresi, üyenin kendi bilgisayarını gösterir; uzaktaki sunucu adresi olarak kullanılmaz.

Docker kurulumunda hata varsa önce engine'in gerçekten çalıştığını ve Compose yapılandırmasının doğrulandığını kontrol et. İlk çözüm olarak ilgisiz konteyner'ları yeniden başlatma veya veri birimi'leri silme.

## Davet çalışmıyor

Davetin seçilen sunucuya ait olduğunu, süresinin dolmadığını ve kullanılmadığını kontrol et. ROOMS'un tek kullanımlık kayıt bileti ile üst sistem topluluk daveti farklıdır.

Yarıda kalan kayıt, bileti `claiming` veya `failed` durumunda bırakabilir. Yönetici, yeni bilet vermeden veya eski kilidi kurtarmadan önce üst sistem'de hesabın oluşup oluşmadığını incelemelidir. Bileti körlemesine `available` durumuna çevirme; hesap zaten oluşmuş olabilir.

Parola kurtarma, üst sistem kurulumunun posta/kurtarma yapılandırmasına bağlıdır. Bu hizmet kurulmadıysa uygulama kendi başına hesabı kurtaramaz.

## Ses bağlanıyor ama duyulmuyor veya paylaşım çalışmıyor

**Üyenin kontrolleri:**

1. Mikrofon/çıkış cihazını ve işletim sistemi gizlilik izinlerini kontrol et.
2. Mikrofon kapatma, sağırlaştırma ve yerel katılımcı sesini kontrol et.
3. İşletim sistemi yakalama iznini değiştirdiysen gerekiyorsa uygulamayı yeniden aç.
4. Başka cihaz/kulaklık dene; karşı tarafın gerçekten ses/görüntü alıp almadığını sor.
5. Paylaşımda gerçek bir kaynak seç. Sistem sesi, platform ve derlemeye göre ayrı sınırlar taşır.

**Yöneticinin kontrolleri:**

1. Herkese açık LiveKit adresi dış ağdan erişilmeli; uzak istemcilerde WSS kullanılmalı.
2. LiveKit ve erişim servisinin API anahtarı/sırrı eşleşmeli.
3. Gerçek üye ve kanalda ViewChannel/Connect ve yayın izinleri doğrulanmalı.
4. TCP/UDP medya erişimi, herkese açık IP duyurusu ve gereken NAT/TURN düzeni kontrol edilmeli.
5. İmzalı LiveKit webhook'u erişim servisindeki `/v1/media/webhook` adresine ulaşmalı.
6. Ayrı ağlardaki iki fiziksel cihazla ayrılma/yeniden katılma ve izin iptali dahil denenmeli.

Sunucunun CPU/RAM'i tek başına yeterli kapasiteyi kanıtlamaz. Yayın bit hızı'i, izleyici sayısı, ağ çıkışı, paket kaybı ve RTT önemlidir. Kaynak deposu belirli bir sunucu boyutunu veya katılımcı sayısını sertifikalandırmaz.

## Etkinlikler veya müzik kullanılamıyor

Activities ayrı servis ve kalıcı depolama ister. Yetkilendirme hatası veritabanından değil, üyelik veya rolden kaynaklanabilir. Herkese açık ters vekil, Activities ön ekini doğru servise yönlendirmelidir.

Müzik için çalışan çalışan, eşleşen bağımsız servis sırrı ve izinli kaynak yapılandırması gerekir. Java/native sağlayıcı bileşenlerinin ek ön koşulları vardır; [isteğe bağlı servisler](SELF_HOSTING.md#isteğe-bağlı-servisler) bölümüne bak. VLC'de oynayan bir kanal, uygulamanın oynatma yolunun da çalıştığını kanıtlamaz. Kullanılabilir motorlar ve açık kabul konuları [kişisel oynatma rehberindedir](PERSONAL_PLAYBACK_ENGINES.md).

İsteğe bağlı servisler kapalı bırakılabilir. Normal sohbet için gerekmezler; Agent da ses için zorunlu değildir.

## Güncelleme kullanılamıyor

Dağıtıcı bir besleme ve uyumlu güvenilir paketler yayımlamalıdır. Kaynaktan alınan derleme kendiliğinden başka dağıtıcının kanalına girmez. Doğru sürümü dağıtıcına sor. İmza hatası incelenmelidir; kontrolü aşma veya doğrulama anahtarını gelişigüzel değiştirme.

Daha eski bir sürüm öneriliyorsa önbellekte veya çalışan güncelleyicide bekleyen bir kurulum bulunabilir. Yeni beslemenin doğru olması ile eski uygulamanın yeni sürümü gerçekten sunması ayrı kontrollerdir. Kullanıcı oturumunu veya bekleyen güncellemeyi habersiz temizleme. Windows'ta güncelleme yeni EXE indirilip kurularak yapılır.

## Derleme ve kurulum sorunları

- **Yanlış Node/pnpm:** `package.json` ve [geliştirme rehberindeki](DEVELOPMENT.md) sabit sürümleri kullan.
- **Kilit dosyası hatası:** `--frozen-lockfile` hatasını kaydet. Kilit dosyasını silerek geçiştirme; önce araç zincirini ve paket kaynağına erişimini kontrol et.
- **Mac yerel derleme hatası:** Xcode Command Line Tools ve desteklenen mimariyi kontrol et. Paketleme ve imzalama ayrıca ön koşullar ister.
- **Port kullanımda:** kendi geliştirme sürecini durdur veya izole ortam seç. Bilmediğin servisi sonlandırma.
- **Eksik `infra/local` dosyaları:** geçmiş yerel doğrulama yardımcıları özel üretilmiş dosyalar bekler; otomatik üretim kurulumu değildir. [Açık kurulum adımlarını](SELF_HOSTING.md) izle.
- **Veritabanı migration komutu yok:** Activities mevcut PostgreSQL tablosunu açılışta oluşturur; bu, genel bir sürüm yükseltme/düşürme sistemi sağlamaz. Sürüm değiştirmeden veri biçimi uyumluluğunu incele.

## Yararlı hata bildirimi

Kaynak commiti veya uygulama sürümünü, işletim sistemini/mimariyi, beklenen ve gerçekleşen davranışı ve en küçük yeniden üretim adımlarını yaz. Gerçek sunucu mu, yerel örnek mi kullandığını belirt. Medyada kimin gönderip kimin aldığını ve farklı ağlar kullanılıp kullanılmadığını ekle.

Parola, belirteç, özel davet bağlantısı, kimlik bilgili sağlayıcı adresi, oturum dosyası veya ayıklanmamış veritabanı ekleme. Hassas konularda [SECURITY.md](../SECURITY.md) yolunu izle.
