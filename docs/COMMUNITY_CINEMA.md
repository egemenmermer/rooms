# Topluluk Sineması

[← README](../README.md) · [Mimari](ARCHITECTURE.md) · [Etkinlik protokolü](ACTIVITY_PROTOCOL.md) · [Sunucu kurulumu](SELF_HOSTING.md)

Sinema, sol menüde kalıcı duran ortak izleme salonudur. Topluluk sahibi sunucunun IPTV hesabını bir kez bağlar. Hesap kaldırılana kadar salon kanalını görebilen herkes canlı kanalları, yayın akışını, filmleri ve dizileri gezer ve birlikte açar. Aynı salonda YouTube bağlantıları ve ekran paylaşımı da açılır.

Kişisel medya (Medyam) bundan ayrıdır ve özel kalır. Sinema'daki yeniden yayın yalnızca sahibin bağladığı hesap içindir ([geliştirme kuralları](../AGENTS.md)).

## İçindekiler

- [Akış](#akış)
- [Güvenlik sınırları](#güvenlik-sınırları)
- [Aktarım](#aktarım)
- [Altyazılar](#altyazılar)
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
  - Biletler 120 saniyeliktir. Ana süreç süreyi kendi saatiyle sayar ve bitmeden `POST /v1/halls/:hall/sessions/:session/ticket` ile yeniler; bu uç röleyi asla başlatmaz veya yeniden başlatmaz. Salon başka bir öğeye geçtiyse veya hesap değiştiyse 410 (`CINEMA_SESSION_ENDED`) döner, oynatıcı yeniden bağlanır.
  - Stoat yetki yanıtları 20 saniye önbelleğe alınır (yalnızca başarılı olanlar); afiş ve rehber gezintisi üyenin Stoat hız sınırını tüketmez.
- **Kayıtlar.** Hiçbir log satırında sağlayıcı adresi veya kimlik bilgisi yer almaz; Kanal'dan taşınan maskeleme kullanılır.

## Aktarım

Sunucu 2 vCPU / 3,7 GB RAM'dir, bu yüzden video **dönüştürülmez**.

- **Kod çözücüler.** Önce `ffprobe` çalışır.
  - H.264 ve HEVC görüntü kopyalanır (`-c:v copy`).
  - Ses AAC stereoya çevrilir; bu, AC-3/E-AC-3 kanallarının Chromium'da sessiz kalmasını önler.
  - MPEG-2 gibi diğer görüntü kodekleri `CINEMA_CODEC_UNSUPPORTED` ile açıkça reddedilir.
- **Çıktı.** fMP4 segmentli HLS üretilir ve tmpfs'te tutulur.
  - Canlı yayında 8 segmentlik kayan pencere kullanılır. İstemciler rölenin canlı kenarının 3 segment (yaklaşık 6 saniye) gerisine hizalanır (hls.js `liveSyncPosition`). Herkes aynı listeyi okuduğu için izleyiciler en fazla yaklaşık bir segment farkla aynı anı görür ve hedef hiçbir zaman pencerenin dışına düşmez. Duvar saati kullanılmaz: canlı kaynak hız sınırı olmadan okunduğu için sağlayıcının bağlantı başındaki veri yığını PDT'yi gerçek saatin önüne geçirir; eski saat hedefi pencerenin dışında kalıp oynatıcıyı döngüye sokuyordu.
  - Film ve dizide okuma hızı sınırlanır ve yaklaşık 60 saniyelik pencere tutulur (`ROOMS_CINEMA_VOD_WINDOW_SEC`). Sarma işlemi aktarımı yeni konumdan yeniden başlatır.
  - Her liste `EXT-X-PROGRAM-DATE-TIME` taşır ve servis çıktı zamanı 0'ın PDT'sini (`originPdtMs`) bildirir; oynatıcılar eserdeki konumu `offsetSec + (oynatılan tarih − originPdtMs)` olarak hesaplar.
  - İmaj, rölenin test edildiği sürümü kullanır: `mwader/static-ffmpeg:9.0.2` (Debian'ın ffmpeg 5.1'i gereken bayrakları tanımaz).
- **ffmpeg'in ağ erişimi.**
  - ffmpeg sağlayıcı adresini hiç görmez. Servis içindeki loopback vekil her adımı özel ağ engeli, sabitlenmiş DNS ve en fazla 4 yönlendirme ile `privateFetch` üzerinden yapar.
  - HLS listeleri yeniden yazılır. Böylece ffmpeg iç servislere ulaşamaz ve kimlik bilgisi süreç argümanlarında görünmez.
- **Okuma hızı.** Altyazısız filmler ffmpeg'in `-readrate 1` ayarıyla okunur. Altyazılı filmlerde bu ayar kullanılmaz; ayrıntısı [Altyazılar](#altyazılar) bölümündedir.
- **Bağlantı bütçesi.**
  - Aynı anda çalışan aktarım sayısı en fazla hesabın `max_connections` değeri ve `ROOMS_CINEMA_MAX_RELAYS` (varsayılan 1) kadardır. Bütçe doluysa en uzun süredir izlenmeyen aktarım kapanır.
  - 60 saniye izleyicisi olmayan aktarım durur.

## Altyazılar

Film ve dizi bölümlerinde altyazının üç kaynağı vardır: dosyanın kendi gömülü metin altyazıları (SubRip, ASS/SSA, mov_text, WebVTT), SubDL'de bulunanlar ve izleyicinin kendi dosyası. Altyazıyı her izleyici kendisi seçer; seçim başkasının ekranını değiştirmez.

### Gömülü altyazılar

- **Çıkarma.** Röle, aynı ffmpeg sürecinde her metin altyazısını ayrı bir WebVTT dosyasına (`sub<n>.vtt`) yazar. Sağlayıcıya ikinci bir bağlantı açılmaz. En fazla 16 iz aktarılır.
- **Desteklenmeyenler.** Görüntü tabanlı altyazılar (PGS, DVD, DVB) OCR gerektirdiği için aktarılmaz. Canlı kanallarda altyazı yoktur.
- **Zamanlama.** ffmpeg altyazıyı sarma noktasından (`startSec`) itibaren zamanlar. Servis cue'ları eserin kendi zamanına çevirerek sunar. Oynatıcı bunları salonun ortak konumuyla (`offsetSec` ve PROGRAM-DATE-TIME) eşleştirir. Hâlâ yazılan son cue sunulmaz.
- **Okuma hızı.** ffmpeg'in `-readrate` ayarı en yavaş akışı izler. Seyrek bir altyazı akışı neredeyse her zaman en yavaşıdır. Bu yüzden ffmpeg cue'lar arasında sınırsız okur, sonraki cue'da ise dakikalarca bekler. Altyazılı filmlerde okuma hızını loopback vekil belirler:
  - HLS çıktısı, ffmpeg başladığından beri geçen süreyi en fazla 15 saniye önde tutar.
  - İlk segmentten sonra baytlar, kaynağın ortalama bit hızının en fazla 1,5 katıyla geçer (2 saniyelik kova). Bu sınır olmasa vekil beklerken biriken veri ffmpeg'e loopback hızında akardı.

### Çevrimiçi altyazılar (SubDL)

- **Anahtar.** Topluluk sahibi Sunucu ayarları → Sinema → Altyazılar bölümüne kendi ücretsiz SubDL API anahtarını girer. Servis anahtarı bir aramayla doğrular ve IPTV bilgileri gibi şifreli yapılandırmada saklar. Anahtar hiçbir yanıtta ve günlükte yer almaz; üyeler yalnızca aramanın açık olup olmadığını görür.
- **Arama.** Servis, filmi veya bölümü TMDB kimliğiyle arar. Xtream satırlarında kimlik yoksa filmin `get_vod_info` yanıtına bir kez bakılır. Kimlik bulunamazsa ad ve yıl kullanılır. Türkçe ve İngilizce altyazılardan en fazla beşer tanesi listelenir; sonuç 12 saat önbellekte tutulur.
- **İndirme.** İzleyici bir altyazı seçtiğinde servis yalnızca o öğenin son aramasındaki kimliği indirir. Zip'ten SubRip, ASS/SSA veya WebVTT dosyasını alır; sezon paketlerinde istenen bölümü seçer. UTF-8 olmayan dosyalar Windows-1254 kabul edilir. Sonuç WebVTT'ye çevrilir ve yaklaşık 16 MB'lık bellek önbelleğinde tutulur. Masaüstü dosyayı `rooms-cinema://subtitle/<salon>/<öğe>/<kimlik>` adresinden, üyenin Stoat belirteci ana süreçte kalarak alır.
- **Neden SubDL?** OpenSubtitles'ın entegratör şartları (13 Ekim 2026) indirilen bir altyazının sunucuda tutulup diğer kullanıcılara sunulmasını yasaklıyor ve hesapsız indirme için ücretli plan istiyor. SubDL ise kullanıcının kendi anahtarını uygulamaya girmesine izin veriyor.

### Kendi dosyası ve zamanlama

- **Dosya.** "Dosyadan yükle…" ile izleyici kendi SRT, VTT veya ASS dosyasını (en fazla 2 MB) seçer. Ana süreç dosyayı okuyup WebVTT'ye çevirir; görünüme yalnızca metin geçer, dosya yolu geçmez. Dosya yalnızca o izleyicide görünür.
- **Zamanlama.** Menüdeki zamanlama satırı altyazıyı yarım saniyelik adımlarla erkene alır veya geciktirir. Bu, farklı bir sürüm için hazırlanmış altyazıları hizalamak içindir ve yalnızca izleyicinin kendisini etkiler.

### Arayüz

- Kontrol çubuğundaki altyazı menüsünde "Kapalı", filmin kendi altyazıları, SubDL'den gelenler, yüklenen dosya, "Dosyadan yükle…" ve zamanlama yer alır. Arama sürerken, anahtar yokken veya altyazı alınamadığında menü bunu açıkça yazar.
- Salon başka bir dil duyuyorsa Türkçe altyazı kendiliğinden açılır: önce filmin kendi Türkçe izi, yoksa SubDL'deki ilk Türkçe altyazı. Türkçe seste yalnız zorunlu Türkçe altyazı açılır. Altyazıyı kapatan izleyiciye bir daha kendiliğinden açılmaz.

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
| `ROOMS_CINEMA_STORAGE_KEY` | 64 onaltılık karakter; hesap ve katalog şifreleme anahtarı. Yedekle; değişirse kayıtlı hesap okunamaz ve servis başlamaz, sahibin hesabı yeniden bağlaması gerekir. |
| `ROOMS_CINEMA_TICKET_SECRET` | En az 32 karakter; aktarım bileti imzası |
| `STOAT_INTERNAL_URL` | Özel ham Stoat API (`http://api:14702`) |
| `ROOMS_SOCIAL_READ_MONGO_URL` | Yalnızca okuyabilen üyelik okuyucusu (Access ve Activities ile aynı) |
| `ROOMS_ACTIVITIES_INTERNAL_URL` | Salon etkinliğini okumak için (`http://activities:3031`) |
| `ROOMS_CINEMA_MAX_RELAYS` | Aynı anda en fazla aktarım; hesabın sınırını aşamaz |
| `ROOMS_CINEMA_USER_AGENT` | Sağlayıcıya giden istemci adı; varsayılan `ROOMS-Cinema/1.0` |
| `ROOMS_CINEMA_ALLOW_PRIVATE_SOURCES` | Yalnızca yerel geliştirme. `1` olursa SSRF korumasının tamamı kapanır (özel ağlar ve yönlendirmeler serbest kalır); üretimde asla ayarlama |
| `ROOMS_CINEMA_VOD_WINDOW_SEC` | Film rölesinin tuttuğu saniye (imajda 60) |

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
- `tests/community-cinema-ipc.test.ts`: ana süreç IPC doğrulaması, biletin görünüme gitmemesi, 410 ve hesap değişimi, altyazı izlerinin aynı oturumun `sub<n>.vtt` dosyalarına eşlenmesi.
- `tests/community-cinema-subtitles.test.ts`: WebVTT okuma ve yazma, yazılmakta olan cue, ffmpeg altyazı çıktıları, eser zamanına çevirme, vekil hız kapısı ve kendiliğinden altyazı seçimi.
- `tests/community-cinema-online-subtitles.test.ts`: SubRip/ASS okuma, Windows-1254, sınırlı zip okuyucu, taklit SubDL ile arama, sıralama, bölüm süzme, anahtar/sonuç yok/kesinti ayrımı ve zip'ten WebVTT'ye çevirme.
- `tests/community-cinema-service.test.ts` (çevrimiçi altyazılar): anahtarın yalnız sahipçe girilmesi ve hiçbir yanıtta ya da diskte açık görünmemesi, TMDB kimliğiyle arama, eksik kimlik için `get_vod_info`, bölüm araması, yalnız listelenen kimliklerin bir kez indirilmesi.
- `tests/caption-file.test.ts`: izleyicinin seçtiği SRT/ASS/VTT dosyasının WebVTT'ye çevrilmesi.
- `tests/community-cinema-relay-native.test.ts` (`ROOMS_CINEMA_RELAY_NATIVE=1`, ffmpeg 9): seyrek SubRip ve ASS izli bir MKV ile hız sınırı, sarma sonrası zamanlama ve eser zamanındaki cue'lar.

Bunlar birim, taklit servis ve yerel kontrollerdir. Gerçek sağlayıcı hesabı, iki fiziksel bilgisayarda birlikte izleme, Windows ve uzun canlı yayın kabulü ayrıca yapılmalıdır.
