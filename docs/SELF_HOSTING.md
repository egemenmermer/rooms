# Kendi ROOMS topluluğunu kur

[← README](../README.md) · [Kullanım](USER_GUIDE.md) · [Sorun giderme](TROUBLESHOOTING.md)

## İçindekiler

- [Neyi çalıştırıyorsun?](#neyi-çalıştırıyorsun)
- [Gereksinimler](#gereksinimler)
- [1. Kaynak kodu al](#1-kaynak-kodu-al)
- [2. Sosyal arka uç kurulumu](#2-sosyal-arka-uç-kurulumu)
- [3. LiveKit yapılandırması](#3-livekit-yapılandırması)
- [4. ROOMS servislerini yapılandır ve başlat](#4-rooms-servislerini-yapılandır-ve-başlat)
- [5. İlk hesap ve davetler](#5-i̇lk-hesap-ve-davetler)
- [6. Masaüstü istemcisini bağla](#6-masaüstü-istemcisini-bağla)
- [7. Dış ağdan erişim](#7-dış-ağdan-erişim)
- [İsteğe bağlı servisler](#i̇steğe-bağlı-servisler)
- [Veriler ve yedekler](#veriler-ve-yedekler)
- [Operasyon kontrolleri](#operasyon-kontrolleri)
- [Başkalarını davet etmeden önce](#başkalarını-davet-etmeden-önce)

## Neyi çalıştırıyorsun?

Arka ucu bir yönetici çalıştırır; üyeler masaüstü uygulamasını kullanır. Her üyeye Docker, veritabanı erişimi veya servis sırları vermen gerekmez.

| Bileşen | Sorumluluk | Gereken özellik |
| --- | --- | --- |
| Stoat servisleri | Hesap, sohbet/olaylar, dosyalar ve sosyal veriler | Topluluk girişi ve sohbet |
| ROOMS erişim servisi | Üyelik, kayıt aracısı, kısa süreli medya izinleri | ROOMS kaydı ve ses yetkilendirmesi |
| LiveKit | Gerçek zamanlı medya sinyali ve aktarımı | Ses, kamera ve ekran paylaşımı |
| ROOMS Activities | Yetkili ortak etkinlik durumu | Etkinlikler ve oyunlar |
| Müzik çalışanı | Ortak kuyruk ve kaynaklar | İsteğe bağlı DJ |
| Agent makinesi | Sınırlandırılmış görevler ve kalıcı görev durumu | İsteğe bağlı Agent |
| Ters vekil | Dışarıya açık HTTPS/WSS rotaları | Uzak üyeler |

Bu rehber mevcut kaynağı ve kurulum sınırlarını anlatır; **tek komutla üretim kurulumu değildir**. İlk hesabı/topluluğu oluşturmak üst sistem yönetim işidir ve burada otomatikleştirilmez. Denenmemiş bir kurulumu üyeler için hazır diye sunma.

Yerel adımlar loopback adreslerini kullanır. Başka bilgisayardan bağlanmadan dış ağ adımlarını tamamla. Önce temiz veya izole ortam kullan. Mevcut canlı veri birimi üzerinde uyumlu yedek ve incelenmiş veri geçişi planı olmadan kurulum çalıştırma.

## Gereksinimler

- Yönettiğin sunucu, kalıcı disk ve uygun güvenlik duvarı.
- Git, Node.js **22.22.0**, pnpm **11.25.0**.
- Sabitlenmiş Stoat kurulumu için Docker Engine ve Docker Compose.
- Kilit dosyasındaki istemci/sunucu SDK'larıyla uyumlu LiveKit sunucusu.
- Uzak erişim için TLS, reverse ters vekil ve medya ağı yapılandırması.
- Kapasite izleme ve sunucudan bağımsız yedek konumu.

Bu depo belirli CPU/RAM paketini veya kişi sayısını sertifikalandırmaz. Hedef yayıncı/izleyici sayısıyla medya trafiğini ve yükü ölç. Müzik ve Agent için kaynak ihtiyacı ayrıca değerlendirilir.

## 1. Kaynak kodu al

```sh
git clone https://github.com/egemenmermer/rooms.git
cd rooms
pnpm install --frozen-lockfile
pnpm services:build
```

Aksi belirtilmedikçe depo kökünde çalış. Derlenmiş servisler `dist-services/` altındadır. Bağımlılık yüklemek bir sunucuyu başlatmaz.

## 2. Sosyal arka uç kurulumu

ROOMS, [UPSTREAM.json](../infra/stoat/UPSTREAM.json) ile sabitlenmiş, **değiştirilmemiş** Stoat kullanır. Bu sürümü habersiz üst sistem `main` ile değiştirme. Yardımcı betik sabit dağıtım dosyalarını indirip özel yerel yapılandırma oluşturur:

```sh
pnpm stoat:setup
```

`compose.yml`, `Revolt.toml`, ortam dosyaları ve sırlar Git'in yok saydığı `.local/stoat/` altında oluşur. Davetli kayıt açılır; herkese açık ters vekil, doğrudan üst sistem hesap oluşturmayı kapatır. Mevcut `Revolt.toml` korunur; kurulumu tekrar çalıştırmak sürüm yükseltme veya yapılandırma geçişi değildir.

Üretilen dosyaları sırları issue'ya kopyalamadan yerelde incele. Ardından doğrula:

```sh
docker info
# Depo kökünden:
docker compose --project-directory .local/stoat config --quiet
node scripts/stoat-start.mjs
```

Başlatıcı seçilen sosyal servisleri açar; ROOMS erişim, Activities veya bağımsız ROOMS LiveKit servisini açmaz. Upstream web/native ses profilleri varsayılan olarak kapalıdır. [Entegrasyon ayrıntılarına](../infra/stoat/README.md) bak.

### Yerel adresler

| Adres | Amaç | Erişim |
| --- | --- | --- |
| `http://127.0.0.1:3021` | Yerel herkese açık ters vekil; API `/api`, olaylar `/ws` | Kurulumda loopback |
| `http://127.0.0.1:3022` | Aracının kullandığı ham üst sistem API | Yalnız özel ağ |
| `127.0.0.1:3023` | Geliştirme MongoDB eşlemesi | Yalnız özel ağ |
| `127.0.0.1:3002` | ROOMS erişim servisi | Proxy arkasında |
| `127.0.0.1:3031` | Activities servisi | Proxy arkasında |

Docker'dan ana makineye erişim için `.env.web`, `host.docker.internal` kullanır. Bu adın ve dinleme adresinin kendi Docker ortamında çalıştığını doğrula. Servisleri konteyner içine alırsan gerçek iç servis adlarını ve erişilebilir dinleme adreslerini kullan. Linux bridge konteyner, ana makinenin yalnız loopback dinleyen servisine ulaşamayabilir. Bunu ham API veya veritabanını internete açarak çözme.

## 3. LiveKit yapılandırması

Resmî LiveKit sunucusunu [kendi sunucunda çalıştırma belgesine](https://docs.livekit.io/transport/self-hosting/) göre kur. Yapılandırmayı sen sağlarsın; istemciye açık adres ile servislerin kullandığı iç adres farklı amaçlar taşır.

İzole yerel yerel sunucu için Git'in yok saydığı `.local/livekit.yaml` oluştur. **Başlatmadan iki yer tutucuyu bağımsız üretilmiş anahtar/sır ile değiştir.** Aşağıdaki değerler kullanılabilir kimlik bilgileri değildir.

```yaml
port: 7880
bind_addresses: ["127.0.0.1"]
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50020
  use_external_ip: false
keys:
  YOUR_LIVEKIT_API_KEY: YOUR_LIVEKIT_API_SECRET
webhook:
  api_key: YOUR_LIVEKIT_API_KEY
  urls:
    - "http://127.0.0.1:3002/v1/media/webhook"
```

```sh
livekit-server --config .local/livekit.yaml
```

Dosyayı yalnız servis hesabı okuyabilsin. ROOMS erişim servisinde **aynı** anahtar/sırrı kullan. İmzalı webhook, LiveKit'in çalıştığı ortamdan erişim servisine ulaşmalıdır; konteynerden yukarıdaki yerel loopback adresine erişilemeyebilir.

Bu loopback örneği uzak üyeler için uygun değildir. Herkese açık kurulumda erişilebilir duyurulan IP, WSS sinyali, eşleşen TCP/UDP portları ve gereken NAT/TURN düzeni doğrulanır. LiveKit API sırları sunucuda kalır; istemciler kısa süreli yetki alır.

Geçmişteki `scripts/livekit-*` yardımcıları `infra/local/` altında özel dosyalar bekler. Bunlar yerel doğrulama kolaylığıdır; bu rehberin üretim kurulum tarifi değildir. Önce beklenen girdilerini incele. Yukarıdaki açık yapılandırma, geçmişte üretilmiş dosyalara bağımlı değildir.

## 4. ROOMS servislerini yapılandır ve başlat

Özel dizinleri oluşturup ortam kontrol listesini kopyala:

```sh
mkdir -p .local/soundboard .local/activities
cp infra/templates/core.env.example .local/core.env
```

PowerShell'de eşdeğer dosya işlemleri için `New-Item -ItemType Directory -Force` ve `Copy-Item` kullan. `.local/core.env` dosyasını yerelde düzenle; commit etme.

| Ayar | Anlamı |
| --- | --- |
| `SERVICE_HOST` | Dinleme adresi; servisleri özel tut, yalnız gerekli rotaları ters vekil ile aç |
| `PORT` / `ACTIVITY_PORT` | Erişim / Activities portları; varsayılan 3002 / 3031 |
| `STOAT_INTERNAL_URL` | Özel ham API kaynak adresini; yerelde `http://127.0.0.1:3022` |
| `LIVEKIT_INTERNAL_URL` | Erişim servisinden ulaşılan LiveKit adresi; yerelde `http://127.0.0.1:7880` |
| `LIVEKIT_PUBLIC_URL` | İstemcinin ulaşacağı medya adresi; yerelde `ws://127.0.0.1:7880`, uzakta `wss://…` |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Eşleşen kendi LiveKit kimlik bilgilerin |
| `ROOMS_SOUNDBOARD_DIRECTORY` | Yazılabilir kalıcı soundboard dizini |
| `ROOMS_ACTIVITY_DATA` | PostgreSQL yoksa dosya tabanlı etkinlik dizini |
| `ROOMS_ACTIVITY_DATABASE_URL` | İsteğe bağlı Activities PostgreSQL bağlantısı |
| `ROOMS_REGISTRATION_INVITES_FILE` | Kalıcı kayıt bileti işlem defteri |
| `ROOMS_ACCOUNT_INVITE_MONGO_URL` | Hesap daveti oluşturma için kapsamlı Mongo bağlantısı |
| `ROOMS_SOCIAL_READ_MONGO_URL` | İsteğe bağlı sınırlı sosyal yetki okuma bağlantısı |

Yerel kayıt için özel ortam dosyana şunları ekle. `.local/stoat/broker.env` bunlar için referanstır; Node bu dosyayı kendiliğinden yüklemez:

```dotenv
ROOMS_REGISTRATION_INVITES_FILE=.local/stoat/registration-invites.json
ROOMS_ACCOUNT_INVITE_MONGO_URL=mongodb://127.0.0.1:3023/revolt
```

Loopback geliştirme Mongo adresi üretim kimlik bilgisi stratejisi değildir. Üretimde kapsamlı servis hesapları kur; davet eklemek genel veritabanı yöneticisi yetkisi gerektirmez. İsteğe bağlı şifreli depoların anahtarlarını veri geçişi olmadan değiştirme.

Her servisi depo kökünden ayrı terminalde çalıştır:

```sh
node --env-file=.local/core.env dist-services/access.cjs
```

```sh
node --env-file=.local/core.env dist-services/activities.cjs
```

Aynı ortam ortak değerleri sağlayabilir; süreçler kendi port ayarlarını kullanır. Node keyfî `.env` dosyalarını otomatik okumaz. Üretimde ayrı işletim sistemi kullanıcısı, açık çalışma dizini/ortamı, yazılabilir veri dizinleri ve yeniden başlatma sınırları olan denetimli servisler kullan.

## 5. İlk hesap ve davetler

**Bu zorunlu yönetici adımı kurulumun otomatik sonucu değildir.** Davet üretme betiği, zaten var olan ve yetkili olduğun üst sistem topluluk davetini ister; ilk yöneticiyi veya topluluğu oluşturmaz.

1. Sabit üst sistem kurulumun desteklediği yönetim/API yolu ile ilk hesabı, topluluğu ve kanalları oluştur. Üretilen `.local/stoat/Guides.md` ve üst sistem API belgelerine bak. Hesap akışın gerektiriyorsa posta/kurtarmayı yapılandır.
2. Sahibi olduğun topluluk için üst sistem daveti edin ve özel tut. Herkese açık ROOMS ters vekil ham hesap oluşturmayı bilerek kapatır; geçici kurulum istisnasını açık bırakma.
3. Erişim aracısının ve kalıcı bilet dosyasının hazır olduğunu doğrula.
4. ROOMS kayıt bileti üret:

```sh
node scripts/stoat-issue-invite.mjs --community-code=YOUR_AUTHORIZED_COMMUNITY_CODE --expires-in=86400
```

Yer tutucuyu kendi yetkili üst sistem davetinle değiştir. Betik sahip olunan Docker Compose veritabanında üst sistem hesap daveti oluşturur, ROOMS biletini özet anahtarıyla saklar. Kodu konsola yazmak yerine özel `.local/stoat/signup-invite-*.json` teslim dosyası üretir.

Teslim dosyasının `serverUrl` alanı yereldir; uzak üyeye kendi herkese açık topluluk adresini ver. Doğru sunucu adresini ve bileti hedef üyeyle özel paylaş. Biletleri veya üst sistem kodlarını GitHub belgelerinde/görüntülerinde yayımlama.

Bilet tek kullanımlık ve sürelidir. Çökme veya belirsiz üst sistem sonucu `claiming`/`failed` bırakır. Eski kilidi kurtarmadan veya bileti değiştirmeden hesabın oluşturulup oluşturulmadığını incele. Belirsiz bileti gelişigüzel yeniden kullanılabilir yapma. Tek yetkili aracı/işlem defteri kullan; ayrı dosyalı bağımsız kopyalar güvenli kayıt ölçekleme yolu değildir.

Ayrıntılı entegrasyon notları üst sistem kabul açıklarını kaydeder. API yolunun belgelenmesi, kendi ilk hesap/kayıt akışının denendiği anlamına gelmez.

## 6. Masaüstü istemcisini bağla

Uyumlu masaüstü derlemesini aç veya kur. Aynı makinede yerel ters vekil adresini; uzak üyelerde gerçek herkese açık HTTPS kaynak adresini gir. Önceki adımın hesabını/davetini kullan.

`VITE_ROOMS_DEFAULT_SERVER`, **derleme sırasında** isteğe bağlı sunucu ön ayarıdır. Zorunlu değildir ve kimlik bilgisi içermez. Kayıtlı tercihler ve davetler de etkilidir. [Geliştirme](DEVELOPMENT.md) ve [kullanım](USER_GUIDE.md) rehberlerine bak.

Sesten önce iki hesapla mesajlaşmayı dene. Ardından gerçek üyelik, ViewChannel, Connect ve yayın izinleri bulunan ses özellikli kanala katıl. Yalnız metin kanalı olması ses yetkisi almak için yeterli değildir.

## 7. Dış ağdan erişim

Herkese açık kaynak adresini seç ve arka uçta buna uygun HTTPS/WSS adreslerini duyur. Alan adı kullanışlıdır; IP kullanıyorsan da istemcinin güveneceği TLS kurulumu gerekir. Uzak güvensiz WS bağlantıları istemci tarafından reddedilir.

Herkese açık ters vekil, Stoat API/olay/dosya rotalarını korumalı ve ROOMS yollarını yönlendirmelidir:

| Herkese açık yol | İç hedef | Not |
| --- | --- | --- |
| `/api/*`, `/ws`, dosya/proxy yolları | Sabit üst sistem rotaları | Doğrudan hesap oluşturma engeli korunur |
| `/rooms-access/*` | Erişim 3002 | Ön ek kaldırılarak iletilir |
| `/rooms-activities/*` | Activities 3031 | Ön ek kaldırılarak iletilir |
| `/rooms-branding/*` | Dekoratif statik dosyaların | İsteğe bağlı |

LiveKit sinyali ayrıca yapılandırılmış, istemcinin ulaşabileceği adrestedir. Yerel örnekte sinyal 7880, medya TCP 7881, UDP 50000–50020'dir. Üretim kuralları gerçek yapılandırmayla eşleşmelidir; HTTPS ters vekil tek başına UDP medyayı erişilebilir yapmaz.

Ham API'yi, MongoDB/Redis/RabbitMQ'yu, nesne deposu yönetimini ve sırları özel tut. Sınırlı kimlik bilgileri ve güvenilir iç ağ sağla. Üretimde güvenmeden önce konteyner özetlerini sabitle ve kaydet; kaynak pin dosyası bunların doğrulandığını iddia etmez.

## İsteğe bağlı servisler

Temel giriş, sohbet, izinler ve medya çalıştıktan sonra ekle:

- **Müzik:** [yerel çalışan](../infra/music/README.md), [Compose parçası](../infra/music-compose.fragment.yml), [Java köprüsü](../apps/services/music/youtube-bridge/README.md). Eşleşen bağımsız servis sırrı, izinli kaynaklar ve gereken Java 17/Maven/native dosyaları sağla. Derleme, sağlayıcının oynatmayı kabul ettiğini kanıtlamaz.
- **Agent:** [ayrı sunucu kurulumu](AGENT_DEPLOYMENT.md) veya [ortak sunucuda rootless kurulum](../infra/agent/shared/README.md). İki yolun kullanıcı, ağ ve kaynak sınırlarını ayrı uygula; Core veritabanı veya kişisel sağlayıcı kasası Agent'a verilmez.
- **Sunucu yönetimi:** [HostOps ve yönetim](SERVER_OPERATIONS.md). İzleme, terminal ve görev çalıştırmayı ayrı yetkilerle ele al; normal oda üyeliği sunucu erişimi vermez.
- **İndirme portalı:** kaynak `apps/distribution/` altındadır. `ROOMS_DISTRIBUTION_ORIGIN` ve kendi özel davet/yayın işlem defterini kur. Proje sahibinin adresi hazır gelmez.
- **Görseller:** [topluluk manifesti](CUSTOMIZATION.md) ile DJ adı/posteri/animasyonu sun. Bu bir görsel ayarıdır; oynatma entegrasyonu değildir.

## Veriler ve yedekler

| Veri | Konum | Kurtarma gereksinimi |
| --- | --- | --- |
| Sosyal hesaplar/mesajlar | Stoat veritabanı veri birimleri | Uyumlu üst sistem yedek/geri yükleme |
| Yüklenen dosyalar | Stoat nesne deposu veri birimleri | İlgili üstveri ve anahtarlarla birlikte yedek |
| Kayıt durumu | `ROOMS_REGISTRATION_INVITES_FILE` ve kilit durumu | Kullanılmış/belirsiz durumları koru |
| Etkinlikler | `ROOMS_ACTIVITY_DATA` veya PostgreSQL | Uyumlu seri hale getirilmiş durum |
| Soundboard | `ROOMS_SOUNDBOARD_DIRECTORY` | Dosyaları ve sahipliği koru |
| Agent/yapılandırma | Yapılandırılmış veri dizini ve şifreleme anahtarı | Veri ile eşleşen anahtarı ayrı ve korumalı sakla |

Activities, başlangıçta PostgreSQL'de mevcut `rooms_activity_state` tablosunu oluşturur. Bu, tam sürümlü migration/geri dönüş sistemi değildir. Tek yetkili Activities süreci kullan; ortak PostgreSQL bağımsız komut işlemcilerini kendiliğinden güvenli yapmaz.

Kaynak SHA, yapılandırma sürümü, üst sistem imajları, veri yolları ve yedek zamanını kaydet. Yedekler sır ve kişisel veri içerebilir; erişimi sınırla, sunucudan ayrı kopyala ve izole geri yüklemeyi dene. Rutin çözüm olarak `docker compose down -v` kullanma.

Yükseltmeden önce gerektiği şekilde yazan süreçleri durdur/sakinleştir, tutarlı yedek al ve veri biçimi uyumluluğunu incele. Uyumlu verisi olmadan yalnız kodu geri almak tam kurtarma planı değildir.

## Operasyon kontrolleri

Servisler yerelde çalışırken:

```sh
curl --fail http://127.0.0.1:3002/health
curl --fail http://127.0.0.1:3031/health
```

Bunlar servis sağlık kontrolleridir; tam kabul testi değildir. Yeniden başlatma, disk, yedek yaşı, veritabanı, API hataları, websocket kopması, medya bitrate/kayıp/gecikme ve ağ çıkışını izle. Günlüklere parola, belirteç, özel mesaj veya kişisel medya adresi yazma.

`pnpm stoat:verify`, özel JSON dosyasında açıkça sahip olunan atılabilir hesaplar ister; [entegrasyon belgesine](../infra/stoat/README.md) bak. Doğrulama betikleri veri oluşturabilir veya eski özel girdiler bekleyebilir. Kapsamlarını oku; başkasının canlı topluluğuna yöneltme.

## Başkalarını davet etmeden önce

- Herkese açık kaynak adresi üzerinden iki gerçek hesap kayıt/giriş yapıp mesajlaşabilir.
- Yetkisiz dış hesap kanalları okuyamaz veya medya/etkinlik yetkisi alamaz.
- Farklı ağdaki iki fiziksel cihaz birbirini duyabilir ve seçilen ekranı paylaşabilir.
- Mikrofon/sağırlaştırma, ayrılma/katılma, yeniden bağlantı ve üyelik iptali çalışır.
- İsteğe bağlı servisler çalışır veya neden kullanılamadığını açıklar.
- Yedek izole ortamda başarıyla geri yüklenmiştir.
- Yönetici servis durdurma/kurtarmayı ve yarım kayıtları yönetebilir.
- Saklama, hesap kurtarma, dışa aktarma/silme, kötüye kullanım ve destek yolu tanımlıdır.
- Dağıtılan paket, bildirim, imza ve güncelleme [yayın gereksinimlerini](RELEASING.md) karşılar.

Kendi kurulumunun gerçek sonuçlarını kaydet. Galeri, başarılı derleme ve örnek testler bu kontrollerin yerine geçmez.
