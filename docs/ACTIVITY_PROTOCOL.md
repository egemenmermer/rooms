# Ortak etkinlik protokolü v1

Activity sunucusu oda sürümlerini, katılımcıları, oynatma saatini, kuyrukları, anketleri ve beyaz tahta öğelerini yönetir. Ses oturumları veya medya aktarımı ona ait değildir. Etkinliği bitirmek hiçbir zaman LiveKit'ten ayrılma API'sini çağırmaz.

## API

`GET /v1/rooms/:roomId/activity?afterRevision=0&waitMs=25000`, `ActivityResponse` döndürür. Güncelleme kaybını önlemek için ilk anlık görüntüyü almadan önce abone olun. Uzun sorgu uyandığında sunucu yetkiyi yeniden kontrol eder. Yetkilendirme çözümleyicisi verilmemiş istekler `AUTHORIZATION_NOT_CONFIGURED` ile reddedilir.

`POST /v1/rooms/:roomId/activity/commands` kesin kurallarla doğrulanan şu zarfı kabul eder:

```json
{"protocolVersion":1,"commandId":"550e8400-e29b-41d4-a716-446655440000","expectedRevision":0,"command":{"type":"join"}}
```

Her değişiklik, çağıranın sağladığı `authorize(bearer, roomId)` bağdaştırıcısıyla güncel üst sistem üyeliğini doğrular. Bağdaştırıcı gerçek üst sistem kimliğini ve etkin oluşturma/kontrol izinlerini döndürmelidir. Erişim belirteçleri anlık görüntü veya depolarda saklanmaz. Masaüstü görünümü belirteci almak yerine yerel `rooms.activity` IPC köprüsünü kullanır.

Komutlar oda içinde sırayla uygulanır. Beklenen sürüm uyuşmazsa HTTP 409 `REVISION_CONFLICT` gelir. Güncel durumu okuyup kullanıcıdan amaçlanan değişikliği yeniden denemesini isteyin. Aynı komut kimliğinin birebir tekrarı işlemi yeniden uygulamadan güncel durumu döndürür. Kimliği farklı içerikle kullanmak reddedilir. İşlem kayıtları son 2048 işlemi, olaylar son 256 sürümü tutar; eski komutlar iki kez uygulanmak yerine eski sürümden dolayı reddedilir. `replayRequired`, istemcinin yerel durumunu yanıttaki tam anlık görüntüyle değiştirmesi gerektiğini belirtir.

## Oynatma ve kaynak gizliliği

Çalarken konum `positionSec + (serverNow - effectiveServerTimeMs) * rate / 1000`, dururken `positionSec` değeridir. Medya seçimi oynatma neslini artırır. İstemci önceki neslin bitiş olayını yeni kaydın bitişi saymamalıdır. Yetkili tüm denetleyiciler oynatabilir, duraklatabilir, sarabilir ve kuyruğu yönetebilir.

Ortak kuyruk medyası resmî YouTube video kimliği veya bağımsız kaynağa ait opak referans ve görünen başlık içerir. Kesin şema özel dosyaları, sağlayıcı URL'lerini, kimlik bilgilerini ve kişisel medya bağlantılarını kabul etmez. Bu sistem üstveri eşzamanlaması yapar; medya kaynağı değildir. Katılımcı izinli kaynağını bağımsız çözmelidir. Gerçek YouTube IFrame oynatımı ve iki oynatıcı arasındaki kayma düzeltmesi ayrı masaüstü kabul testleri gerektirir.

Oda başına bir ana Sinema, YouTube veya Ekran etkinliği bulunabilir. Anketler ve beyaz tahta birlikte kullanılabilir. Ev sahibi ayrılırsa veya 30 saniyelik etkinlik kirası biterse bağlı uygun katılımcıların en eskisi ev sahibi olur. Ekran kaynağının sahipliği devrolmaz; yeni ev sahibi `awaiting-source` görür. Uygun katılımcı kalmazsa ana etkinlik biter. İzleme, ses odasında bulunmak anlamına gelmez.

## Kalıcılık ve dağıtım

`ActivityRepository`, load/save/list sağlar. `MemoryActivityRepository` yalnızca test içindir. `FileActivityRepository` yerel geliştirme sunucusunu 0600 izinli dosyalar ve atomik değiştirmeyle kalıcı tutar. Tek yazıcı süreç destekler; veritabanı düzeyinde çökme dayanıklılığı veya dağıtık kilit iddiası yoktur. Birden çok kopya dağıtmadan önce PostgreSQL işlem uygulaması ve çok süreçli sürüm kilidiyle değiştirilmelidir. Mevcut arayüz protokol değişmeden bunu mümkün kılar.

## Doğrulama

`pnpm test` içindeki `tests/activity-realtime.test.ts`, gerçek yerel TCP Fastify sunucusu ve ayrı yetkilendirilmiş iki HTTP istemcisiyle oynatma eşzamanlamasını, uzun sorgu güncellemelerini, eski sürüm reddini, komut tekilliğini, ev sahibi devrini, kalıcı anket oylarını, dış kullanıcı reddini ve kimlik bilgili medya URL'sinin kesin reddini sınar. Ayrı kontroller yetki yapılandırılmadığında reddi ve başka yazarın tahta öğesini silme reddini kanıtlar. `node scripts/activities-build.mjs` servis modülünü derler.

Durum: servis ve protokol, test üyelik çözümleyicisi verilerek yerelde doğrulandı. Üretim Stoat yetkisi, dağıtılmış servis, iki gerçek masaüstü oynatıcısı, yerel oynatma eşzamanlaması ve fiziksel bilgisayarın yeniden bağlanması ayrı entegrasyon kabul kontrolleridir. Oynanabilir sunucu yetkili masalar için `game.create` ve türlendirilmiş oyun komutlarını kullanın. Genel medya `start` komutu, oyun kurallarının açık seçilmesini sağlamak için oyun kimliklerini reddeder. Oyun durumları her yetkili kullanıcıya ayrı yansıtılır; özel deste/stok veya diğer oyuncuların açılmamış elleri gösterilmez. Sınanan kural profilleri ve kalan kabul için [oyun kurallarına](GAME_RULES.md) bakın.

## Gerçek masaüstü örnek kabulü

`node scripts/verify-activity-desktop.mjs`, gerçek Activity HTTP sunucusuna bağlanan iki ayrı Electron profili açar. Sosyal yetkilendirme yalnızca test düzeneğindeki Playwright inceleyici işleyicileriyle değiştirilir; QA alt bilgisi ve QA kimlikleri sürekli görünür. Bu, üretim yetkisini aşan bir yol veya Stoat entegrasyon sonucu değildir.

Doğrulanan arayüz işlemleri: Holdem masası oluşturma, ikinci kullanıcının oturması, el başlatma, herkesin kendi özel kartları, pas/sonuç geçmişi, ikinci kullanıcının anket oyu, ortak tahta yazısı ve Sinema oynat/duraklat/sarma işlemlerinin ikinci gerçek HTML videoya ulaşması. Özel kabul ekran görüntüleri açık depoya dahil değildir. Kayıtlı çalışmada görünüm sayfası hatası sıfırdır. Dağıtılmış Stoat yetkisi ve resmî YouTube sağlayıcı kabulü ayrı koşullardır.
