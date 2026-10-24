# Host your own Tayfa community

[← README](../README.md) · **[Türkçe ↓](#türkçe)**

This English section covers the one-command install. The manual setup, optional services and operations details below are in Turkish for now.

## Quick install (one command)

You can set up a Tayfa server for your group of friends in about 15 minutes. Chat, voice, screen sharing and shared activities come with it; music (DJ), Cinema, Agent and the server management panel are optional and not included.

The **Set up your own server** tab on the app's start screen shows the same steps one screen at a time: rent a server, get a DuckDNS address, open the ports, run the install command, sign in and create an invite.

### What you need

| Need | Note |
| --- | --- |
| Linux server (VPS) | Ubuntu 22.04/24.04 or Debian 12, **at least 2 GB RAM (4 GB recommended)**, 2 vCPU, 20 GB disk. x86_64 and ARM64 are supported. |
| Domain | For example `chat.example.com`. No domain? Get a free name from [DuckDNS](https://www.duckdns.org) (`friends.duckdns.org`). |
| Open ports | `80/tcp`, `443/tcp` (HTTPS) and `7881/tcp`, `7882/udp` (voice/video). Open them in your provider's firewall. |

A computer at home works too, but you must forward these ports on your router and have a stable public IP. A rented VPS is easier to start with.

### 1. Point the domain at the server

Set your domain's **A record** to the server's public IPv4 address. With DuckDNS, the install script does this for you; just have your subdomain and DuckDNS token ready.

### 2. Run the install command

Connect to the server over SSH and run:

```sh
curl -fsSL https://raw.githubusercontent.com/egemenmermer/rooms/main/deploy/install.sh | sudo bash
```

The script, in order:

1. Installs Docker if missing and downloads Tayfa to `/opt/rooms`.
2. Asks for the domain and the certificate email; generates every password and key randomly on the server.
3. Starts the services. The HTTPS certificate comes from Let's Encrypt automatically and renews itself.
4. Creates the **community owner** account (email, username, password) and the first community with a voice channel.
5. Prints your first invite link (7 days, 10 people).

The installer's prompts are in Turkish.

### 3. Connect from the app

1. [Download the Tayfa app](https://github.com/egemenmermer/rooms/releases/latest) and open it.
2. On the **Sign in** tab, enter `https://your-domain` as the server and sign in with the owner account.
3. Invite friends with **Create invite** in the app, or make new links on the server:

```sh
sudo rooms invite                     # one link: 7 days, 10 people
sudo rooms invite --uses=3 --days=2   # 3 people, valid for 2 days
sudo rooms invite --count=5           # five separate links
```

`--uses` is 1–50, `--days` 1–7, `--count` 1–20. Each line looks like `https://your-domain/davet/<token>  (7 gün · 10 kişi · son geçerlilik: …)`.

You can send one link to several friends. Your friend opens it in a browser; the page (Turkish or English, following the browser) has **Download the app** and **Open in Tayfa** buttons. If the button does not open the app, pasting the link on the app's **Sign up** tab is enough; the link decides the server address.

- **Uses:** opening the link uses nothing. A use counts only on a successful sign-up, or when an existing account that is not yet a member joins. A member who opens the link again uses nothing.
- **Copying:** a link is shown only when it is created; the server stores only its SHA-256 hash. If you lose it, create a new one.
- **Managing:** see active links under **Settings → Members and roles → Invites**: uses (for example 3/10 people), expiry, creator and Active/Full status; links made with `rooms invite` show "Server" as the creator. **Cancel** closes a link at once; people who joined through it stay in the community. Every member allowed to invite (everyone by default in Stoat) can create links; listing and revoking belong to the community owner. A community can have at most 50 active links.

Known limits:

- The link carries the right to sign up in its address. A short lifetime, a people limit and revoking limit that risk; the page is hidden from search engines (`noindex`) and sends no referrer (`no-referrer`). Still, do not share links in public places.
- **Download the app** goes to GitHub's `releases/latest`. GitHub does not show pre-releases there; if RC builds are not marked "latest", your friend may get an older version.
- When a link expires, its upstream community invite stays in Stoat; only a revoked link's invite is deleted.
- The invite link flow has not yet been accepted on two physical computers.

### Day-to-day management

| Command | What it does |
| --- | --- |
| `sudo rooms status` | Shows the services and whether the server is reachable from outside |
| `sudo rooms invite` | Creates a new invite link (default 7 days, 10 people; `--uses`, `--days`, `--count`) |
| `sudo rooms logs [service]` | Follows the logs (for example `rooms logs access`) |
| `sudo rooms backup` | Backs up the database, files and configuration under `/opt/rooms/deploy/backups` |
| `sudo rooms update [version]` | Takes a backup, then updates to the latest `main` (or to the given release tag, e.g. `v0.1.18-rc.30`) and restarts Caddy |
| `sudo rooms restart` / `stop` | Restarts / stops the services (data is kept) |

The backup holds passwords and messages. Copy it somewhere safe off the server, and try restoring it now and then.

### If something goes wrong

- **No certificate:** the domain's A record must point at the server IP and ports 80/443 must be open. After fixing it, run `sudo rooms restart`.
- **Messages work, voice does not connect:** open `7881/tcp` and `7882/udp` in your provider's firewall. If `ufw` is active on the server, run `sudo rooms firewall`.
- **The invite link does not open the Tayfa page in a browser:** the page is served from `/davet`. If you updated a server installed before that path existed, run `sudo rooms restart` once; Caddy reads the new route when it restarts.
- **Anything else:** check `sudo rooms status` and `sudo rooms logs` against the [troubleshooting guide](TROUBLESHOOTING.md) (Turkish) or open a GitHub issue. Never share passwords, tokens or invite links.

The quick install is for one server and a small-to-medium group of friends. For hundreds of concurrent users, a separate media server, or optional services like music and Agent, use the detailed setup in the Turkish section below.

---

## Türkçe

**Kendi Tayfa topluluğunu kur**

[English ↑](#host-your-own-tayfa-community) · [Kullanım](USER_GUIDE.md) · [Sorun giderme](TROUBLESHOOTING.md)

### İçindekiler

- [Hızlı kurulum (tek komut)](#hızlı-kurulum-tek-komut)
- [Neyi çalıştırıyorsun?](#neyi-çalıştırıyorsun)
- [Gereksinimler](#gereksinimler)
- [1. Kaynak kodu al](#1-kaynak-kodu-al)
- [2. Sosyal arka uç kurulumu](#2-sosyal-arka-uç-kurulumu)
- [3. LiveKit yapılandırması](#3-livekit-yapılandırması)
- [4. Tayfa servislerini yapılandır ve başlat](#4-rooms-servislerini-yapılandır-ve-başlat)
- [5. İlk hesap ve davetler](#5-i̇lk-hesap-ve-davetler)
- [6. Masaüstü istemcisini bağla](#6-masaüstü-istemcisini-bağla)
- [7. Dış ağdan erişim](#7-dış-ağdan-erişim)
- [İsteğe bağlı servisler](#i̇steğe-bağlı-servisler)
- [Veriler ve yedekler](#veriler-ve-yedekler)
- [Operasyon kontrolleri](#operasyon-kontrolleri)
- [Başkalarını davet etmeden önce](#başkalarını-davet-etmeden-önce)

### Hızlı kurulum (tek komut)

Kendi arkadaş grubun için Tayfa sunucusunu yaklaşık 15 dakikada kurabilirsin. Sohbet, ses, ekran paylaşımı ve ortak etkinlikler bu kurulumla gelir; müzik (DJ), Agent ve sunucu yönetim paneli isteğe bağlıdır ve dahil değildir.

Uygulamanın başlangıç ekranındaki **Kendi sunucunu kur** sekmesi aynı adımları her ekranda bir adım olacak şekilde gösterir: sunucu kirala, DuckDNS adresi al, portları aç, kurulum komutunu çalıştır, giriş yapıp davet oluştur.

#### Gerekenler

| Gereken | Not |
| --- | --- |
| Linux sunucu (VPS) | Ubuntu 22.04/24.04 veya Debian 12, **en az 2 GB RAM (4 GB önerilir)**, 2 vCPU, 20 GB disk. x86_64 ve ARM64 desteklenir. |
| Alan adı | Örnek: `sohbet.ornek.com`. Alan adın yoksa [DuckDNS](https://www.duckdns.org) üzerinden ücretsiz bir ad alabilirsin (`arkadaslar.duckdns.org`). |
| Açık portlar | `80/tcp`, `443/tcp` (HTTPS) ve `7881/tcp`, `7882/udp` (ses/görüntü). Sağlayıcının güvenlik duvarında bunları aç. |

Evdeki bilgisayarda da çalışır, ancak modemde bu portları yönlendirmen ve sabit bir genel IP'ye sahip olman gerekir. Başlamak için kiralık bir VPS daha kolaydır.

#### 1. Alan adını sunucuya yönlendir

Alan adının **A kaydını** sunucunun genel IPv4 adresine ayarla. DuckDNS kullanıyorsan bu adımı kurulum betiği senin için yapar; yalnızca alt adını ve DuckDNS token'ını hazır tut.

#### 2. Kurulum komutunu çalıştır

Sunucuya SSH ile bağlan ve şunu çalıştır:

```sh
curl -fsSL https://raw.githubusercontent.com/egemenmermer/rooms/main/deploy/install.sh | sudo bash
```

Betik sırasıyla şunları yapar:

1. Docker yoksa kurar ve Tayfa'yı `/opt/rooms` altına indirir.
2. Alan adını ve sertifika e-postasını sorar; tüm parolaları ve anahtarları sunucuda rastgele üretir.
3. Servisleri başlatır. HTTPS sertifikası Let's Encrypt'ten otomatik alınır ve yenilenir.
4. **Topluluk sahibi** hesabını (e-posta, kullanıcı adı, parola) ve ilk topluluğu, ses kanalıyla birlikte oluşturur.
5. İlk davet bağlantını yazdırır (7 gün, 10 kişi).

#### 3. Uygulamadan bağlan

1. [Tayfa uygulamasını indir](https://github.com/egemenmermer/rooms/releases/latest) ve aç.
2. **Giriş yap** sekmesinde sunucu olarak `https://alan-adin` gir ve sahip hesabınla giriş yap.
3. Arkadaşlarını uygulamadaki **Davet oluştur** ile davet et veya sunucuda yeni bağlantı üret:

```sh
sudo rooms invite                     # bir bağlantı: 7 gün, 10 kişi
sudo rooms invite --uses=3 --days=2   # 3 kişilik, 2 gün geçerli bağlantı
sudo rooms invite --count=5           # beş ayrı bağlantı
```

`--uses` 1–50, `--days` 1–7, `--count` 1–20 arasındadır. Her satır `https://alan-adin/davet/<token>  (7 gün · 10 kişi · son geçerlilik: …)` biçimindedir.

Tek bir bağlantıyı birden çok arkadaşına gönderebilirsin. Arkadaşın bağlantıyı tarayıcıda açar; sayfada **Uygulamayı indir** ve **Tayfa'da aç** düğmeleri vardır. Düğme uygulamayı açmazsa bağlantıyı uygulamadaki **Kayıt ol** sekmesine yapıştırması yeterlidir; sunucu adresini bağlantı belirler.

- **Kullanım:** bağlantıyı açmak kullanım harcamaz. Bir kullanım yalnızca başarılı kayıtta veya üye olmayan mevcut bir hesap katıldığında sayılır. Zaten üye olan biri bağlantıyı yeniden açarsa hak harcanmaz.
- **Kopyalama:** bağlantı yalnızca oluşturulduğu anda gösterilir; sunucu yalnızca SHA-256 özetini saklar. Kaybettiysen yenisini oluştur.
- **Yönetim:** etkin bağlantıları uygulamada **Ayarlar → Üyeler ve roller → Davetler** bölümünde görürsün: kullanım (ör. 3/10 kişi), son geçerlilik, oluşturan ve Etkin/Dolu durumu; `rooms invite` ile üretilenlerde oluşturan "Sunucu" görünür. **İptal et** bağlantıyı hemen kapatır; bağlantıyla katılmış olanlar toplulukta kalır. Davet etme izni olan her üye (Stoat'ta varsayılan olarak herkes) bağlantı oluşturabilir; listeleme ve iptal topluluk sahibindedir. Bir toplulukta en fazla 50 etkin bağlantı olabilir.

Bilinen sınırlar:

- Bağlantı, kayıt hakkını adresin içinde taşır. Kısa süre, kişi sınırı ve iptal bu riski sınırlar; sayfa arama motorlarına kapalıdır (`noindex`) ve yönlendiren adresi göndermez (`no-referrer`). Bağlantıyı yine de herkese açık yerlerde paylaşma.
- **Uygulamayı indir** düğmesi GitHub'daki `releases/latest` adresine gider. GitHub bu adreste ön sürümleri göstermez; RC paketleri "latest" olarak işaretlenmediyse arkadaşın eski bir sürüm görebilir.
- Süresi dolan bağlantının üst sistem topluluk daveti Stoat'ta kalır; yalnızca iptal edilen bağlantınınki silinir.
- Davet bağlantısı akışının iki fiziksel bilgisayarla gerçek cihaz kabulü henüz yapılmadı.

#### Günlük yönetim

| Komut | Ne yapar? |
| --- | --- |
| `sudo rooms status` | Servisleri ve sunucunun dışarıdan erişilebilir olup olmadığını gösterir |
| `sudo rooms invite` | Yeni davet bağlantısı üretir (varsayılan 7 gün, 10 kişi; `--uses`, `--days`, `--count`) |
| `sudo rooms logs [servis]` | Günlükleri izler (örnek: `rooms logs access`) |
| `sudo rooms backup` | Veritabanı, dosyalar ve yapılandırmanın yedeğini `/opt/rooms/deploy/backups` altına alır |
| `sudo rooms update [sürüm]` | Önce yedek alır, sonra `main` dalının son haline (ya da verilen sürüm etiketine, ör. `v0.1.18-rc.30`) günceller ve Caddy'yi yeniden başlatır |
| `sudo rooms restart` / `stop` | Servisleri yeniden başlatır / durdurur (veriler korunur) |

Yedek dosyası parolaları ve mesajları içerir. Onu sunucunun dışında güvenli bir yere kopyala ve ara sıra geri yüklemeyi dene.

#### Sorun çıkarsa

- **Sertifika alınamıyor:** Alan adının A kaydı sunucu IP'sini göstermeli ve 80/443 portları açık olmalı. Düzelttikten sonra `sudo rooms restart` çalıştır.
- **Mesajlar çalışıyor, ses bağlanmıyor:** `7881/tcp` ve `7882/udp` portlarını sağlayıcının güvenlik duvarında aç. Sunucuda `ufw` etkinse `sudo rooms firewall` çalıştır.
- **Davet bağlantısı tarayıcıda Tayfa sayfasını açmıyor:** sayfa `/davet` yolundan sunulur. Bu yol gelmeden önce kurulmuş bir sunucuyu güncellediysen bir kez `sudo rooms restart` çalıştır; Caddy yeni yolu yeniden başlayınca okur.
- **Başka bir sorun:** `sudo rooms status` ve `sudo rooms logs` çıktısıyla [sorun giderme rehberine](TROUBLESHOOTING.md) bak veya GitHub'da issue aç. Parola, token veya davet bağlantısı paylaşma.

Hızlı kurulum tek sunucu ve küçük-orta bir arkadaş grubu içindir. Yüzlerce eşzamanlı kullanıcı, ayrı medya sunucusu veya müzik/Agent gibi isteğe bağlı servisler için aşağıdaki ayrıntılı kurulumu kullan.

### Neyi çalıştırıyorsun?

Aşağıdaki bölümler hızlı kurulumun arkasındaki parçaları ve elle kurulumu anlatır.

Arka ucu bir yönetici çalıştırır; üyeler masaüstü uygulamasını kullanır. Her üyeye Docker, veritabanı erişimi veya servis sırları vermen gerekmez.

| Bileşen | Sorumluluk | Gereken özellik |
| --- | --- | --- |
| Stoat servisleri | Hesap, sohbet/olaylar, dosyalar ve sosyal veriler | Topluluk girişi ve sohbet |
| Tayfa erişim servisi | Üyelik, kayıt aracısı, kısa süreli medya izinleri | Tayfa kaydı ve ses yetkilendirmesi |
| LiveKit | Gerçek zamanlı medya sinyali ve aktarımı | Ses, kamera ve ekran paylaşımı |
| Tayfa Activities | Yetkili ortak etkinlik durumu | Etkinlikler ve oyunlar |
| Müzik çalışanı | Ortak kuyruk ve kaynaklar | İsteğe bağlı DJ |
| Agent makinesi | Sınırlandırılmış görevler ve kalıcı görev durumu | İsteğe bağlı Agent |
| Ters vekil | Dışarıya açık HTTPS/WSS rotaları | Uzak üyeler |

Bu rehber mevcut kaynağı ve kurulum sınırlarını anlatır; **tek komutla üretim kurulumu değildir**. İlk hesabı/topluluğu oluşturmak üst sistem yönetim işidir ve burada otomatikleştirilmez. Denenmemiş bir kurulumu üyeler için hazır diye sunma.

Yerel adımlar loopback adreslerini kullanır. Başka bilgisayardan bağlanmadan dış ağ adımlarını tamamla. Önce temiz veya izole ortam kullan. Mevcut canlı veri birimi üzerinde uyumlu yedek ve incelenmiş veri geçişi planı olmadan kurulum çalıştırma.

### Gereksinimler

- Yönettiğin sunucu, kalıcı disk ve uygun güvenlik duvarı.
- Git, Node.js **22.22.0**, pnpm **11.25.0**.
- Sabitlenmiş Stoat kurulumu için Docker Engine ve Docker Compose.
- Kilit dosyasındaki istemci/sunucu SDK'larıyla uyumlu LiveKit sunucusu.
- Uzak erişim için TLS, reverse ters vekil ve medya ağı yapılandırması.
- Kapasite izleme ve sunucudan bağımsız yedek konumu.

Bu depo belirli CPU/RAM paketini veya kişi sayısını sertifikalandırmaz. Hedef yayıncı/izleyici sayısıyla medya trafiğini ve yükü ölç. Müzik ve Agent için kaynak ihtiyacı ayrıca değerlendirilir.

### 1. Kaynak kodu al

```sh
git clone https://github.com/egemenmermer/rooms.git
cd rooms
pnpm install --frozen-lockfile
pnpm services:build
```

Aksi belirtilmedikçe depo kökünde çalış. Derlenmiş servisler `dist-services/` altındadır. Bağımlılık yüklemek bir sunucuyu başlatmaz.

### 2. Sosyal arka uç kurulumu

Tayfa, [UPSTREAM.json](../infra/stoat/UPSTREAM.json) ile sabitlenmiş, **değiştirilmemiş** Stoat kullanır. Bu sürümü habersiz üst sistem `main` ile değiştirme. Yardımcı betik sabit dağıtım dosyalarını indirip özel yerel yapılandırma oluşturur:

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

Başlatıcı seçilen sosyal servisleri açar; Tayfa erişim, Activities veya bağımsız Tayfa LiveKit servisini açmaz. Upstream web/native ses profilleri varsayılan olarak kapalıdır. [Entegrasyon ayrıntılarına](../infra/stoat/README.md) bak.

#### Yerel adresler

| Adres | Amaç | Erişim |
| --- | --- | --- |
| `http://127.0.0.1:3021` | Yerel herkese açık ters vekil; API `/api`, olaylar `/ws` | Kurulumda loopback |
| `http://127.0.0.1:3022` | Aracının kullandığı ham üst sistem API | Yalnız özel ağ |
| `127.0.0.1:3023` | Geliştirme MongoDB eşlemesi | Yalnız özel ağ |
| `127.0.0.1:3002` | Tayfa erişim servisi | Proxy arkasında |
| `127.0.0.1:3031` | Activities servisi | Proxy arkasında |

Docker'dan ana makineye erişim için `.env.web`, `host.docker.internal` kullanır. Bu adın ve dinleme adresinin kendi Docker ortamında çalıştığını doğrula. Servisleri konteyner içine alırsan gerçek iç servis adlarını ve erişilebilir dinleme adreslerini kullan. Linux bridge konteyner, ana makinenin yalnız loopback dinleyen servisine ulaşamayabilir. Bunu ham API veya veritabanını internete açarak çözme.

### 3. LiveKit yapılandırması

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

Dosyayı yalnız servis hesabı okuyabilsin. Tayfa erişim servisinde **aynı** anahtar/sırrı kullan. İmzalı webhook, LiveKit'in çalıştığı ortamdan erişim servisine ulaşmalıdır; konteynerden yukarıdaki yerel loopback adresine erişilemeyebilir.

Bu loopback örneği uzak üyeler için uygun değildir. Herkese açık kurulumda erişilebilir duyurulan IP, WSS sinyali, eşleşen TCP/UDP portları ve gereken NAT/TURN düzeni doğrulanır. LiveKit API sırları sunucuda kalır; istemciler kısa süreli yetki alır.

Geçmişteki `scripts/livekit-*` yardımcıları `infra/local/` altında özel dosyalar bekler. Bunlar yerel doğrulama kolaylığıdır; bu rehberin üretim kurulum tarifi değildir. Önce beklenen girdilerini incele. Yukarıdaki açık yapılandırma, geçmişte üretilmiş dosyalara bağımlı değildir.

### 4. Tayfa servislerini yapılandır ve başlat

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
| `ROOMS_PERSONAL_SOUNDS_DIRECTORY` | Yazılabilir kalıcı giriş sesi dizini; varsayılan `/state/personal-sounds` |
| `ROOMS_PERSONAL_SOUND_UPLOADS` | `0`, `false`, `off` veya `no` ise (büyük/küçük harf fark etmez) üyeler yeni ses yükleyemez; daha önce yüklenen sesler ve Tayfa'nın hazır sesleri seçilebilir ve çalınabilir kalır |
| `ROOMS_PERSONAL_SOUNDS_MAX_MB` | Yüklenen giriş seslerinin toplam üst sınırı (MB); varsayılan 512 |
| `ROOMS_ACTIVITY_DATA` | PostgreSQL yoksa dosya tabanlı etkinlik dizini |
| `ROOMS_ACTIVITY_DATABASE_URL` | İsteğe bağlı Activities PostgreSQL bağlantısı |
| `ROOMS_REGISTRATION_INVITES_FILE` | Kalıcı davet bağlantısı defteri |
| `ROOMS_ACCOUNT_INVITE_MONGO_URL` | Her kayıtta yeni üst sistem hesap daveti eklemek için kapsamlı Mongo bağlantısı; yoksa uygulamadan davet oluşturulamaz |
| `ROOMS_SIGNUP_SPACE_ID` | İsteğe bağlı [onaylı kayıt](#onaylı-kayıt-davet-bağlantısı-olmadan) için topluluk kimliği; boşsa kapalı |
| `ROOMS_SIGNUP_REQUESTS_FILE` | Kalıcı kayıt isteği dosyası; varsayılan `.local/stoat/signup-requests.json` |
| `ROOMS_SIGNUP_PER_IP_PER_HOUR` / `ROOMS_SIGNUP_PER_HOUR` / `ROOMS_SIGNUP_MAX_PENDING` | Onaylı kayıt sınırları; varsayılan 3 / 20 / 50 |
| `ROOMS_PUBLIC_URL` | `/davet` sayfasındaki **Tayfa'da aç** bağlantısının herkese açık HTTPS adresi; yoksa isteğin `Host` başlığı kullanılır |
| `ROOMS_DOWNLOAD_URL` | `/davet` sayfasındaki **Uygulamayı indir** adresi; varsayılan GitHub `releases/latest` (ön sürümleri göstermez) |
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

### 5. İlk hesap ve davetler

**Bu zorunlu yönetici adımı kurulumun otomatik sonucu değildir.** Davet üretme betiği, zaten var olan ve yetkili olduğun üst sistem topluluk davetini ister; ilk yöneticiyi veya topluluğu oluşturmaz.

1. Sabit üst sistem kurulumun desteklediği yönetim/API yolu ile ilk hesabı, topluluğu ve kanalları oluştur. Üretilen `.local/stoat/Guides.md` ve üst sistem API belgelerine bak. Hesap akışın gerektiriyorsa posta/kurtarmayı yapılandır.
2. Sahibi olduğun topluluk için üst sistem daveti edin ve özel tut. Herkese açık Tayfa ters vekil ham hesap oluşturmayı bilerek kapatır; geçici kurulum istisnasını açık bırakma.
3. Erişim aracısının ve kalıcı davet defterinin hazır olduğunu doğrula.
4. Tek kullanımlık ilk davetini üret:

```sh
node scripts/stoat-issue-invite.mjs --community-code=YOUR_AUTHORIZED_COMMUNITY_CODE --expires-in=86400
```

Yer tutucuyu kendi yetkili üst sistem davetinle değiştir. Betik sahip olunan Docker Compose veritabanında üst sistem hesap daveti oluşturur ve davet defterine (sürüm 2) tek kullanımlık bir kayıt yazar; defterde yalnızca token'ın SHA-256 özeti durur. `--expires-in` en fazla 604800 saniyedir (7 gün). Token'ı konsola yazmak yerine özel `.local/stoat/signup-invite-*.json` teslim dosyası üretir. Dosyada 64 karakterlik `inviteCode` ve `rooms://` biçimindeki `appLink` bulunur.

Teslim dosyasının `serverUrl` ve `appLink` alanları yereldir. Uzak üyeye kendi herkese açık adresinle `https://<adresin>/davet/<inviteCode>` bağlantısını ver; bu sayfa için ters vekilin `/davet/*` yolunu erişim servisine iletmesi gerekir ([7. adım](#7-dış-ağdan-erişim)). Yerel denemede `appLink` değerini veya `http://127.0.0.1:3021/davet/<inviteCode>` adresini doğrudan **Kayıt ol** sekmesindeki **Davet bağlantısı** alanına yapıştırabilirsin. `pnpm stoat:setup` vekili `/davet/*` yolunu yerel erişim servisine iletir; bu yol, kurulumu bu sürümle yeniden ürettiğinde gelir. Bağlantıyı yalnızca hedef üyeyle paylaş. Bağlantıları veya üst sistem kodlarını GitHub belgelerinde/görüntülerinde yayımlama.

Sahip hesabıyla giriş yaptıktan sonra çok kullanımlık bağlantıları uygulamadaki **Davet oluştur** ile üret. Bunun için `ROOMS_ACCOUNT_INVITE_MONGO_URL` gerekir; erişim servisi her kayıtta üst sistemde yeni bir hesap daveti ekler. Betikle üretilen davetler bir topluluğa bağlı olmadığından **Davetler** listesinde görünmez ve uygulamadan iptal edilemez; kısa süre ver.

Her kullanım, dış hesap çağrısından önce defterde `claiming` olarak ayrılır. Başarı `used` olur. Üst sistemde kesinlikle hiçbir şey oluşmadıysa kullanım `released` olarak geri verilir. Sonuç belirsizse `uncertain` kalır ve kullanım sayılır; hesap oluşmuş olabilir. Çökme sonrası kalan `claiming` de kullanım sayılır. 30 saniyeden eski kilit dosyası kendiliğinden kaldırılır. Belirsiz kullanımı elle geri açma; kişi önce giriş yapmayı denesin, gerekirse yeni bağlantı ver. Tek yetkili aracı/işlem defteri kullan; ayrı dosyalı bağımsız kopyalar güvenli kayıt ölçekleme yolu değildir.

Eski sürüm 1 defter ilk yazmada sürüm 2'ye çevrilir; özgün dosya bir kez `<defter>.v1.bak` olarak yanına kopyalanır. Süresi dolalı 30 günden fazla olan kayıtlar her yazmada defterden silinir.

Ayrıntılı entegrasyon notları üst sistem kabul açıklarını kaydeder. API yolunun belgelenmesi, kendi ilk hesap/kayıt akışının denendiği anlamına gelmez.

#### Onaylı kayıt (davet bağlantısı olmadan)

İsteğe bağlıdır ve varsayılan olarak kapalıdır. Açıkken masaüstündeki ve iPhone'daki **Kayıt ol** ekranında **Onay isteğiyle** seçeneği çıkar: kişi kullanıcı adını, e-postasını ve şifresini girer (masaüstünde sunucu adresini de), davet bağlantısı gerekmez. **İstek gönderilince hesap oluşmaz.** Topluluk sahibi veya yöneticisi (davet bağlantılarını yönetebilen kişiler) isteği **Ayarlar → Üyeler ve roller → Kayıt istekleri** bölümünde onaylar ya da reddeder. Onaydan sonra hesap, mevcut davet bağlantılı kayıtla oluşur ve kişi topluluğa aynı adımda katılır. Reddedilen veya süresi dolan isteğe hiç hesap açılmaz.

Nasıl çalışır:

- Ters vekil ham hesap oluşturmayı engellemeye devam eder; Caddy yapılandırması değişmez. Yeni yollar zaten iletilen `/rooms-access/*` altındadır.
- İstek yalnızca e-posta ve kullanıcı adı taşır; şifre sunucuya gitmez. Erişim aracı Stoat'a hiçbir çağrı yapmaz, hesap daveti eklemez. Kişiye rastgele bir **izleme anahtarı** (poll secret) döner; isteğin durumu yalnızca bu anahtarla sorulur.
- İstekler `ROOMS_SIGNUP_REQUESTS_FILE` dosyasında kalıcı tutulur (atomik yazma, dosya kilidi, `0600`). Dosyada istek kimliği, seçilen ad, e-postanın SHA-256 özeti (aynı adresle ikinci açık isteği engellemek için), izleme anahtarının SHA-256 özeti, zamanlar ve kararı veren yöneticinin kimliği durur. E-posta, şifre ve anahtarın kendisi yazılmaz.
- Onayda aracı, onaylayan yöneticinin oturumuyla topluluğun ilk kanalına bir Stoat topluluk daveti açar ve davet defterine (`ROOMS_REGISTRATION_INVITES_FILE`) **tek kullanımlık, 7 günlük** bir kayıt bağlantısı ekler. Bu bağlantı **Davetler** listesinde görünür ve oradan iptal edilebilir. Kişinin bir sonraki sorgusu bağlantıyı **bir kez** alır; aracı onu sonra unutur. İstemci hesabı `/v1/auth/register` ile oluşturur (hesap daveti o anda eklenir, topluluğa katılım aynı adımdadır). Bu yüzden `ROOMS_ACCOUNT_INVITE_MONGO_URL` gerekir.
- Bağlantı alınmadan önce reddetmek, yeniden onaylamak veya kişinin isteği geri çekmesi bağlantıyı kapatır. Alınmış ama kullanılmamış bağlantı **Davetler** listesinden iptal edilebilir veya 7 gün sonra kendiliğinden kapanır.
- Masaüstü izleme anahtarını ve onay bağlantısını ana süreçte işletim sisteminin anahtar zinciriyle (safeStorage) şifreli tutar; iPhone Keychain kullanır. Şifre yalnızca bellekte durur; uygulama kapanırsa kişi onaydan sonra şifresini yeniden girer.
- Karar verilmeyen istek 14 gün sonra süresi dolmuş sayılır ve kuyruktan düşer; kişi yeni istek gönderebilir. Karar verilmiş ve süresi dolmuş kayıtlar 30 gün sonra dosyadan silinir.

Kötüye kullanım sınırları: adres başına saatte 3 kayıt isteği (`ROOMS_SIGNUP_PER_IP_PER_HOUR`), sunucu genelinde saatte 20 (`ROOMS_SIGNUP_PER_HOUR`), en fazla 50 bekleyen istek (`ROOMS_SIGNUP_MAX_PENDING`) ve e-posta başına bir açık istek. Kullanıcı adı 2–32 harf, rakam, `_`, `.` veya `-` olmalıdır; istemciler şifreyi en az 8 karakter ister. Sınır sayaçları bellekte tutulur ve servis yeniden başlayınca sıfırlanır; kalıcı sınır bekleyen istek sayısıdır. E-postası zaten bir hesaba ait kişi onaydan sonra kayıtta açık bir hata görür; tek kullanımlık bağlantı bu durumda harcanmaz.

Açmak için:

1. Topluluğun kimliğini bul (Stoat'taki sunucu kimliği; uygulamada topluluk bağlantısındaki 26 karakterlik ULID). Toplulukta en az bir kanal olmalı.
2. Hızlı kurulumda `/opt/rooms/deploy/.env` dosyasına `ROOMS_SIGNUP_SPACE_ID=<topluluk kimliği>` ekle. İstersen sınırları da ekle. Ardından `sudo rooms up` çalıştır. `ROOMS_SIGNUP_REQUESTS_FILE` Compose dosyasında `/state/signup-requests.json` olarak gelir ve `rooms backup` yedeğine girer.
3. Elle kurulumda erişim servisine `ROOMS_SIGNUP_SPACE_ID`, `ROOMS_SIGNUP_REQUESTS_FILE`, `ROOMS_REGISTRATION_INVITES_FILE` ve `ROOMS_ACCOUNT_INVITE_MONGO_URL` ver.

Kapatmak için `ROOMS_SIGNUP_SPACE_ID` değerini boşalt ve servisi yeniden başlat. Bekleyen istekler dosyada kalır; yeniden açtığında görünür. Verilmiş tek kullanımlık bağlantılar davet defterindedir ve süreleri dolana kadar geçerlidir. Davet bağlantıları ve tek kullanımlık kayıt betiği bu ayardan etkilenmez.

| Yol (`/rooms-access` altında) | Kim | İş |
| --- | --- | --- |
| `GET /v1/auth/signup` | Herkes | Onaylı kaydın açık olup olmadığı |
| `POST /v1/auth/signup-requests` | Herkes (sınırlı) | `{email, username}` ile isteği kuyruğa ekler; `{requestId, pollSecret}` döner, hesap açmaz |
| `GET /v1/auth/signup-requests/:id` | İzleme anahtarı (`Authorization: Bearer`) | Durum; onaylandıysa tek kullanımlık kayıt bağlantısını bir kez döner |
| `DELETE /v1/auth/signup-requests/:id` | İzleme anahtarı | İsteği geri çeker, alınmamış bağlantıyı kapatır |
| `GET /v1/spaces/:spaceId/signup-requests` | Sahip/yönetici | Bekleyen ve onaylanıp bağlantısı henüz alınmamış istekler |
| `POST /v1/spaces/:spaceId/signup-requests/:id/approve` | Sahip/yönetici | Onaylar, tek kullanımlık bağlantı üretir |
| `POST /v1/spaces/:spaceId/signup-requests/:id/reject` | Sahip/yönetici | Reddeder |

### 6. Masaüstü istemcisini bağla

Uyumlu masaüstü derlemesini aç veya kur. **Giriş yap** sekmesinde aynı makinede yerel ters vekil adresini; uzak üyelerde gerçek herkese açık HTTPS kaynak adresini gir. Yeni üye, önceki adımın davet bağlantısını **Kayıt ol** sekmesine yapıştırır; sunucuyu bağlantı belirler.

`VITE_ROOMS_DEFAULT_SERVER`, **derleme sırasında** isteğe bağlı sunucu ön ayarıdır. Zorunlu değildir ve kimlik bilgisi içermez. Kayıtlı tercihler ve davetler de etkilidir. [Geliştirme](DEVELOPMENT.md) ve [kullanım](USER_GUIDE.md) rehberlerine bak.

Sesten önce iki hesapla mesajlaşmayı dene. Ardından gerçek üyelik, ViewChannel, Connect ve yayın izinleri bulunan ses özellikli kanala katıl. Yalnız metin kanalı olması ses yetkisi almak için yeterli değildir.

### 7. Dış ağdan erişim

Herkese açık kaynak adresini seç ve arka uçta buna uygun HTTPS/WSS adreslerini duyur. Alan adı kullanışlıdır; IP kullanıyorsan da istemcinin güveneceği TLS kurulumu gerekir. Uzak güvensiz WS bağlantıları istemci tarafından reddedilir.

Herkese açık ters vekil, Stoat API/olay/dosya rotalarını korumalı ve Tayfa yollarını yönlendirmelidir:

| Herkese açık yol | İç hedef | Not |
| --- | --- | --- |
| `/api/*`, `/ws`, dosya/proxy yolları | Sabit üst sistem rotaları | Doğrudan hesap oluşturma engeli korunur |
| `/rooms-access/*` | Erişim 3002 | Ön ek kaldırılarak iletilir |
| `/davet/*` | Erişim 3002 | Davet sayfası; yol olduğu gibi iletilir, token yolda kalır |
| `/rooms-activities/*` | Activities 3031 | Ön ek kaldırılarak iletilir |
| `/rooms-cinema/*` | Sinema 3050 | İsteğe bağlı; ön ek kaldırılarak iletilir ([Topluluk Sineması](COMMUNITY_CINEMA.md)) |
| `/rooms-branding/*` | Dekoratif statik dosyaların | İsteğe bağlı |

LiveKit sinyali ayrıca yapılandırılmış, istemcinin ulaşabileceği adrestedir. Yerel örnekte sinyal 7880, medya TCP 7881, UDP 50000–50020'dir. Üretim kuralları gerçek yapılandırmayla eşleşmelidir; HTTPS ters vekil tek başına UDP medyayı erişilebilir yapmaz.

Ham API'yi, MongoDB/Redis/RabbitMQ'yu, nesne deposu yönetimini ve sırları özel tut. Sınırlı kimlik bilgileri ve güvenilir iç ağ sağla. Üretimde güvenmeden önce konteyner özetlerini sabitle ve kaydet; kaynak pin dosyası bunların doğrulandığını iddia etmez.

### İsteğe bağlı servisler

Temel giriş, sohbet, izinler ve medya çalıştıktan sonra ekle:

- **Müzik:** [yerel çalışan](../infra/music/README.md), [Compose parçası](../infra/music-compose.fragment.yml), [Java köprüsü](../apps/services/music/youtube-bridge/README.md). Eşleşen bağımsız servis sırrı, izinli kaynaklar ve gereken Java 17/Maven/native dosyaları sağla. Derleme, sağlayıcının oynatmayı kabul ettiğini kanıtlamaz.
- **Agent:** [ayrı sunucu kurulumu](AGENT_DEPLOYMENT.md) veya [ortak sunucuda rootless kurulum](../infra/agent/shared/README.md). İki yolun kullanıcı, ağ ve kaynak sınırlarını ayrı uygula; Core veritabanı veya kişisel sağlayıcı kasası Agent'a verilmez.
- **Sunucu yönetimi:** [HostOps ve yönetim](SERVER_OPERATIONS.md). İzleme, terminal ve görev çalıştırmayı ayrı yetkilerle ele al; normal oda üyeliği sunucu erişimi vermez.
- **İndirme portalı:** kaynak `apps/distribution/` altındadır. `ROOMS_DISTRIBUTION_ORIGIN` ve kendi özel davet/yayın işlem defterini kur. Proje sahibinin adresi hazır gelmez.
- **Görseller:** [topluluk manifesti](CUSTOMIZATION.md) ile DJ adı/posteri/animasyonu sun. Bu bir görsel ayarıdır; oynatma entegrasyonu değildir.

### Veriler ve yedekler

| Veri | Konum | Kurtarma gereksinimi |
| --- | --- | --- |
| Sosyal hesaplar/mesajlar | Stoat veritabanı veri birimleri | Uyumlu üst sistem yedek/geri yükleme |
| Yüklenen dosyalar | Stoat nesne deposu veri birimleri | İlgili üstveri ve anahtarlarla birlikte yedek |
| Kayıt durumu | `ROOMS_REGISTRATION_INVITES_FILE` (varsa `.v1.bak` yedeği) | Kullanım sayılarını ve belirsiz kayıtları koru |
| Kayıt istekleri | `ROOMS_SIGNUP_REQUESTS_FILE` | Bekleyen ve onaylanan istekleri koru; onay bağlantıları davet defterindedir |
| Etkinlikler | `ROOMS_ACTIVITY_DATA` veya PostgreSQL | Uyumlu seri hale getirilmiş durum |
| Soundboard | `ROOMS_SOUNDBOARD_DIRECTORY` | Dosyaları ve sahipliği koru |
| Giriş sesleri | `ROOMS_PERSONAL_SOUNDS_DIRECTORY` | Kişi klasörlerini olduğu gibi koru |
| Agent/yapılandırma | Yapılandırılmış veri dizini ve şifreleme anahtarı | Veri ile eşleşen anahtarı ayrı ve korumalı sakla |

**Giriş sesleri.** Her üyenin giriş/çıkış sesleri kendi klasöründe (`<dizin>/<kullanıcı kimliği>/`) durur: seçimler ve yükleme onayının zamanı `profile.json` içinde, sesler ise sunucunun ses düzeyini eşitlediği en fazla 4 saniyelik WAV dosyaları olarak saklanır; yüklenen özgün dosya tutulmaz. Hızlı kurulumda dizin `/opt/rooms/deploy/data/access/personal-sounds` olur ve `rooms backup` yedeğine girer. Yüklemeyi kapatmak için `/opt/rooms/deploy/.env` dosyasına `ROOMS_PERSONAL_SOUND_UPLOADS=0` (`false`, `off` ve `no` da olur), toplam alanı değiştirmek için `ROOMS_PERSONAL_SOUNDS_MAX_MB=<MB>` ekleyip `sudo rooms up` çalıştır. Bu anahtar yalnızca yeni yüklemeyi durdurur: daha önce yüklenen sesler silinmez, sahipleri onları seçebilir ve odalarda çalmaya devam ederler. Onları da kaldırmak için bir kişinin bütün seslerinde o kişinin klasörünü (`<dizin>/<kullanıcı kimliği>/`), herkesinkinde dizinin kendisini değil içindekileri sil. Servisi yeniden başlatmak gerekmez; bir sonraki ses bağlantısından itibaren o kişi için klasik Tayfa sesi çalar. Tek bir `.wav` dosyasını elle silme, `profile.json` onu listelemeye devam eder; tek bir sesi kişinin kendisi Ayarlar → Ses ve video → **Giriş ve çıkış sesin** bölümünden siler.

Activities, başlangıçta PostgreSQL'de mevcut `rooms_activity_state` tablosunu oluşturur. Bu, tam sürümlü migration/geri dönüş sistemi değildir. Tek yetkili Activities süreci kullan; ortak PostgreSQL bağımsız komut işlemcilerini kendiliğinden güvenli yapmaz.

Kaynak SHA, yapılandırma sürümü, üst sistem imajları, veri yolları ve yedek zamanını kaydet. Yedekler sır ve kişisel veri içerebilir; erişimi sınırla, sunucudan ayrı kopyala ve izole geri yüklemeyi dene. Rutin çözüm olarak `docker compose down -v` kullanma.

Yükseltmeden önce gerektiği şekilde yazan süreçleri durdur/sakinleştir, tutarlı yedek al ve veri biçimi uyumluluğunu incele. Uyumlu verisi olmadan yalnız kodu geri almak tam kurtarma planı değildir.

### Operasyon kontrolleri

Servisler yerelde çalışırken:

```sh
curl --fail http://127.0.0.1:3002/health
curl --fail http://127.0.0.1:3031/health
```

Bunlar servis sağlık kontrolleridir; tam kabul testi değildir. Yeniden başlatma, disk, yedek yaşı, veritabanı, API hataları, websocket kopması, medya bitrate/kayıp/gecikme ve ağ çıkışını izle. Günlüklere parola, belirteç, özel mesaj veya kişisel medya adresi yazma.

`pnpm stoat:verify`, özel JSON dosyasında açıkça sahip olunan atılabilir hesaplar ister; [entegrasyon belgesine](../infra/stoat/README.md) bak. Doğrulama betikleri veri oluşturabilir veya eski özel girdiler bekleyebilir. Kapsamlarını oku; başkasının canlı topluluğuna yöneltme.

### Başkalarını davet etmeden önce

- İki gerçek kişi davet bağlantısıyla herkese açık adres üzerinden kayıt olup mesajlaşabilir; bağlantı sayfası tarayıcıda açılır ve **Tayfa'da aç** uygulamayı başlatır.
- Yetkisiz dış hesap kanalları okuyamaz veya medya/etkinlik yetkisi alamaz.
- Farklı ağdaki iki fiziksel cihaz birbirini duyabilir ve seçilen ekranı paylaşabilir.
- Mikrofon/sağırlaştırma, ayrılma/katılma, yeniden bağlantı ve üyelik iptali çalışır.
- İsteğe bağlı servisler çalışır veya neden kullanılamadığını açıklar.
- Yedek izole ortamda başarıyla geri yüklenmiştir.
- Yönetici servis durdurma/kurtarmayı ve yarım kayıtları yönetebilir.
- Saklama, hesap kurtarma, dışa aktarma/silme, kötüye kullanım ve destek yolu tanımlıdır.
- Dağıtılan paket, bildirim, imza ve güncelleme [yayın gereksinimlerini](RELEASING.md) karşılar.

Kendi kurulumunun gerçek sonuçlarını kaydet. Galeri, başarılı derleme ve örnek testler bu kontrollerin yerine geçmez.
