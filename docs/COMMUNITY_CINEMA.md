# Topluluk Sineması

[← README](../README.md) · [Mimari](ARCHITECTURE.md) · [Etkinlik protokolü](ACTIVITY_PROTOCOL.md) · [Sunucu kurulumu](SELF_HOSTING.md)

Sinema, sol menüde kalıcı duran ortak izleme salonudur. Topluluk sahibi sunucunun IPTV hesabını bir kez bağlar. Hesap kaldırılana kadar salon kanalını görebilen herkes canlı kanalları, yayın akışını, filmleri ve dizileri gezer ve birlikte açar. Aynı salonda YouTube bağlantıları ve ekran paylaşımı da açılır.

Kişisel medya (Medyam) bundan ayrıdır ve özel kalır. Sinema'daki yeniden yayın yalnızca sahibin bağladığı hesap içindir ([geliştirme kuralları](../AGENTS.md)).

## İçindekiler

- [Akış](#akış)
- [Güvenlik sınırları](#güvenlik-sınırları)
- [Aktarım](#aktarım)
- [Etkinlik protokolü](#etkinlik-protokolü)
- [Kurulum](#kurulum)
- [Doğrulama](#doğrulama)

## Akış

1. **Salon ve hesap.** Sahip, Sunucu ayarları → Sinema bölümünden bir salon kanalı seçer. Ardından Xtream bilgilerini (sunucu, kullanıcı adı, şifre) veya M3U adresini girer; isteğe bağlı bir XMLTV adresi de eklenebilir. `get.php?username=…` biçimindeki M3U dışa aktarma bağlantısı Xtream hesabı olarak tanınır.
2. **Doğrulama ve içe aktarma.** Servis hesabı sağlayıcıda doğrular. Sonra kanal, film ve dizileri içe aktarır, ardından rehberi akış hâlinde okur.
   - Rehber penceresi şu andan 6 saat öncesi ile 48 saat sonrası arasıdır; en fazla 300 bin program tutulur.
   - Rehber 12 saatte, katalog 24 saatte bir kendiliğinden yenilenir.
3. **Gezinme.** Salonu görebilen üyeler kategorileri, Türkçe duyarlı aramayı, rehberi ve detayları servisten okur.
   - Dizi bölümleri ve film ayrıntıları ilk açılışta sağlayıcıdan alınır ve saklanır.
   - Görseller servis üzerinden gelir; üyeler sağlayıcıya hiç bağlanmaz.
4. **Birlikte izleme.** Bir üye bir öğeyi açtığında salon etkinliğinin sırasına `community-media` öğesi eklenir. Herkesin istemcisi servisten aynı aktarımı ister.

## Güvenlik sınırları

- **Sağlayıcı bilgileri.**
  - Hesap bilgileri ve katalog anlık görüntüsü sunucuda AES-256-GCM ile şifreli tutulur. Dosyalar 0600, dizinler 0700 izinlidir; katalog önce sıkıştırılır.
  - M3U kayıt adresleri de anahtar taşıyabileceği için şifreli anlık görüntünün içindedir.
  - Anahtar `ROOMS_CINEMA_STORAGE_KEY` değişkenindedir. Anahtarı değiştirmek kayıtlı hesabı okunamaz yapar.
- **Kimin ne yapabildiği.**
  - Salon seçme, hesap bağlama, yeniden yükleme ve kaldırma yalnızca topluluk sahibine açıktır.
  - Katalog, arama, rehber, detay, görsel ve izleme için salon kanalında görüntüleme izni (VIEW_CHANNEL) gerekir.
  - Sahip olmayan üyeler maskeli sunucu adını bile görmez.
- **İstemciye giden veri.**
  - İstemci yalnızca opak öğe kimliklerini (`l-…`, `m-…`, `s-…`, `e-…`) ve opak görsel kimliklerini görür.
  - Etkinlik şeması URL, kullanıcı adı ve şifre taşıyan alanları reddeder.
- **Aktarımı yönlendirme.** Servis yalnızca salon etkinliğinde **seçili olan** öğeyi aktarır. Sunucunun tek sağlayıcı bağlantısını başka bir kanala çevirmek için salonun kumandası gerekir; kumandası olmayan kişi yalnızca sıraya öneri ekleyebilir.
- **Masaüstü tarafı.**
  - Stoat belirteci ve aktarım biletleri Electron ana sürecinde kalır.
  - Görünüm `rooms-cinema://stream/<oturum>/…` ve `rooms-cinema://art/<salon>/<kimlik>` adreslerini kullanır.
  - Biletler 120 saniyeliktir; ana süreç bitmeden yeniler. Salon başka bir öğeye geçtiyse veya hesap değiştiyse 410 döner.
- **Kayıtlar.** Hiçbir log satırında sağlayıcı adresi veya kimlik bilgisi yer almaz; Kanal'dan taşınan maskeleme kullanılır.

## Aktarım

Sunucu 2 vCPU / 3,7 GB RAM'dir, bu yüzden video **dönüştürülmez**.

- **Kod çözücüler.** Önce `ffprobe` çalışır.
  - H.264 ve HEVC görüntü kopyalanır (`-c:v copy`).
  - Ses AAC stereoya çevrilir; bu, AC-3/E-AC-3 kanallarının Chromium'da sessiz kalmasını önler.
  - MPEG-2 gibi diğer görüntü kodekleri `CINEMA_CODEC_UNSUPPORTED` ile açıkça reddedilir.
- **Çıktı.** fMP4 segmentli HLS üretilir ve tmpfs'te tutulur.
  - Canlı yayında 8 segmentlik kayan pencere ve `EXT-X-PROGRAM-DATE-TIME` kullanılır. İstemciler bu zamana göre aynı hedef gecikmeye hizalanır.
  - Film ve dizide okuma hızı sınırlanır ve yaklaşık 3 dakikalık pencere tutulur. Sarma işlemi aktarımı yeni konumdan yeniden başlatır.
- **ffmpeg'in ağ erişimi.**
  - ffmpeg sağlayıcı adresini hiç görmez. Servis içindeki loopback vekil her adımı özel ağ engeli, sabitlenmiş DNS ve en fazla 4 yönlendirme ile `privateFetch` üzerinden yapar.
  - HLS listeleri yeniden yazılır. Böylece ffmpeg iç servislere ulaşamaz ve kimlik bilgisi süreç argümanlarında görünmez.
- **Bağlantı bütçesi.**
  - Aynı anda çalışan aktarım sayısı en fazla hesabın `max_connections` değeri ve `ROOMS_CINEMA_MAX_RELAYS` (varsayılan 1) kadardır. Bütçe doluysa en uzun süredir izlenmeyen aktarım kapanır.
  - 60 saniye izleyicisi olmayan aktarım durur.

## Etkinlik protokolü

Salon, `hall` adlı ana etkinliktir; `roomId` salon kanalının kimliğidir. Sıra `community-media` (`ref`, `title`, `live`, isteğe bağlı `art`) ve `youtube` öğelerini kabul eder.

- Katalog öğeleri herkes için hemen başlar; kaynak ortak olduğu için kişisel dosyadaki hazırlık adımı yoktur.
- Canlı kanalların ortak zaman çizelgesi yoktur. `playback` komutları `LIVE_PLAYBACK_FIXED` ile reddedilir; duraklatma yalnızca izleyicinin kendisinde olur.
- Filmler ve bölümler ortak zaman çizelgesiyle oynar, sarılır ve duraklatılır.
- Ev sahibi, kumanda modu ve devir kuralları [etkinlik protokolündeki](ACTIVITY_PROTOCOL.md) gibidir.

## Kurulum

`infra/cinema.Dockerfile` imajı ve `infra/cinema-compose.fragment.yml` parçası özel üretim yapılandırmasına eklenir. Ters vekil `/rooms-cinema/*` yolunu ön eki kaldırarak `cinema:3050` adresine iletir.

| Değişken | Anlamı |
| --- | --- |
| `ROOMS_CINEMA_STORAGE_KEY` | 64 onaltılık karakter; hesap ve katalog şifreleme anahtarı. Yedekle, değiştirme. |
| `ROOMS_CINEMA_TICKET_SECRET` | En az 32 karakter; aktarım bileti imzası |
| `STOAT_INTERNAL_URL` | Özel ham Stoat API (`http://api:14702`) |
| `ROOMS_SOCIAL_READ_MONGO_URL` | Yalnızca okuyabilen üyelik okuyucusu (Access ve Activities ile aynı) |
| `ROOMS_ACTIVITIES_INTERNAL_URL` | Salon etkinliğini okumak için (`http://activities:3031`) |
| `ROOMS_CINEMA_MAX_RELAYS` | Aynı anda en fazla aktarım; hesabın sınırını aşamaz |
| `ROOMS_CINEMA_USER_AGENT` | Sağlayıcıya giden istemci adı; varsayılan `ROOMS-Cinema/1.0` |
| `ROOMS_CINEMA_ALLOW_PRIVATE_SOURCES` | Yalnızca yerel geliştirme: `1` olursa 127.0.0.1'deki taklit sağlayıcıya izin verir |

`/state` dizinini UID 10003 ve 0700 izniyle hazırla, diğer kalıcı depolar gibi şifreli yedekle. `/hls` yalnızca bellektedir.

## Doğrulama

- `tests/community-cinema-text.test.ts`: Kanal'ın Dart testlerinden çıkarılan 269 vaka. Kapsadığı kurallar: Türkçe arama normalizasyonu, kalite rozetleri, ülke bayrakları, EPG eşleştirme, URL maskeleme ve Türkçe sıralama.
- `tests/community-cinema-protocol.test.ts`: salon etkinliği, canlıda zaman çizelgesi reddi, medya türü ayrımı, şemanın URL reddi.
- `tests/community-cinema-service.test.ts`: taklit Xtream paneline karşı servis. Kapsadığı akışlar:
  - sahiplik ve hesabı doğrulama
  - içe aktarma ve rehber eşleştirme
  - Türkçe arama
  - dizi ve film ayrıntıları
  - yalnızca seçili öğenin aktarılması
  - yanıtlarda ve diskte hesap bilgisinin bulunmaması
  - M3U dışa aktarma bağlantısının Xtream'e çevrilmesi
- `tests/community-cinema-ipc.test.ts`: ana süreç IPC doğrulaması, biletin görünüme gitmemesi, 410 ve hesap değişimi.

Bunlar birim, taklit servis ve yerel kontrollerdir. Gerçek sağlayıcı hesabı, iki fiziksel bilgisayarda birlikte izleme, Windows ve uzun canlı yayın kabulü ayrıca yapılmalıdır.
