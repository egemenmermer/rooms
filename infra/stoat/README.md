# Tayfa Stoat entegrasyonu

Bu belge ilk uygulamayı ve 8 Ekim 2026'da yerel gerçek üst sistem kabulünün engellendiği kontrol noktasını kaydeder. Örnek testler aktarım kabulü değildir. Sonraki üretim/yayın durumu için [kurulum](../../docs/SELF_HOSTING.md) ve [RC12](../../docs/RC12_RELEASE.md) belgelerine bakın; aşağıdaki tarihsel engelleri güncel sunucu durumu olarak yorumlamayın.

## Mimari

Mevcut React/Electron masaüstü Tayfa istemcisidir. `packages/social-domain` sağlayıcıdan bağımsız opak kimlikler sağlar. `packages/stoat-adapter`, resmî Stoat REST/olaylarını mevcut normalleştirilmiş sözleşmeye çevirir; `community.ts` yerel kimlik bilgisi sınırıdır. Eski Spacebar paketi ve şifreli oturumu inceleme/geri dönüş için korunur; etkin bağdaştırıcı bu bilgileri Stoat'a yüklemez veya göndermez.

Resmî kendi sunucunda kurulum sürümü `UPSTREAM.json` içinde sabittir. Üst uygulama kaynağı değiştirilmez. Yalnız dağıtıma ait vekil/ayar değişiklikleri yok sayılan özel `.local/stoat` dizinindedir. Resmî yerel Stoat ses/web istemcileri varsayılan kapalı, isteğe bağlı profillerdir; Tayfa ayrı LiveKit kullanır. Sosyal kimlikler Discord snowflake değil ULID'dir. Sohbet zamanı gerçek mesaj ULID'sinden çözülür.

## Kalıcı, yalnız davetle kayıt

Tayfa davet bağlantısı (`https://<sunucu>/davet/<64 hex token>`), resmî Stoat hesap/topluluk davetinden farklıdır. Açık vekil doğrudan `/api/auth/account/create` yolunu reddeder. Özel yerel ham API portu 3022, aracının resmî hesap oluşturma/giriş/ilk kurulum/topluluğa katılma çağrılarını yapmasını sağlar.

Bir Tayfa bağlantısı süreli (en fazla 7 gün), kişi sınırlı (1–50) bir defter kaydıdır ve bir resmî topluluk davetine bağlanır. Defterde (`ROOMS_REGISTRATION_INVITES_FILE`, sürüm 2) token'ın yalnız SHA-256 özeti arama anahtarı olarak saklanır. Resmî hesap/topluluk kodları sunucuda özel kalır. Çok kullanımlık bağlantıda aracı her kayıt için `ROOMS_ACCOUNT_INVITE_MONGO_URL` üzerinden yeni bir tek kullanımlık resmî hesap daveti ekler; betikle üretilen tek kullanımlık kayıtlar hesap davetini önceden taşır. Yerel istemci token'ı `/rooms-access/v1/auth/register` yoluna verir; resmî hesap daveti sırrını almaz.

Kapı, harici hesap çağrısından önce özel dosya kilidi altında kullanım için `claiming` kaydını atomik fsync eder; ağ çağrıları kilit altında yapılmaz. Başarı `used` olur. Hesap oluşmadan önceki kesin red `released` olur ve hakkı geri verir. Belirsiz sonuç `uncertain` olur ve kullanım sayılır. Çökme sonrası kalan `claiming` de sayılır; 30 saniyeden eski kilit dosyası kendiliğinden kaldırılır. Belirsiz kullanımı sıfırlamayın; üst hesap zaten oluşmuş olabilir. Bu temkinli davranış bilinçlidir. Tek aracı kalıcı diskte tek ortak defter kullanır; bağımsız defterlerle çoğaltmayın. Sürüm 1 defter ilk yazmada sürüm 2'ye çevrilir, özgün dosya bir kez `.v1.bak` olarak kalır. Süresi dolalı 30 günden fazla olan kayıtlar her yazmada silinir.

Açık önizleme (`/v1/auth/invites/:code`) ve `/davet/<token>` sayfası salt okunurdur; kullanım harcamaz, gerçek ayarlı bitişi gösterir. Kayıt ve tüm servis yolları hız sınırlıdır. `stoat-issue-invite.mjs` token'ı yazdırmak yerine özel teslim dosyası yazar.

v0.15.5 üst topluluk davetinde süre/azami kullanım alanı yoktur. Üst main'de yeni alanlar olsa da v0.15.5'te var sayılmaz. Uygulama daveti yalnız topluluk sahibine açıktır: aracı resmî daveti özel oluşturur ve süreli (7 gün), kişi sınırlı (10) Tayfa bağlantısı döndürür; topluluk başına en fazla 20 etkin bağlantı olur. Girişli kullanıcı da bağlantıyla katılabilir; zaten üyeyse kullanım harcanmaz. İptal, aracının o bağlantı için oluşturduğu resmî daveti en iyi çabayla siler; süresi dolan bağlantınınki silinmez. Hazırlık `ROOMS_ACCOUNT_INVITE_MONGO_URL` ister; yoksa arayüz açık kullanılamama nedeni alır. Mevcut üst davetler incelenip kullanılabilir. İlk kontrol noktasında bu yollar canlı Stoat'ta çalıştırılmamıştı.

## Komutlar

```sh
node scripts/stoat-setup.mjs
node scripts/stoat-start.mjs
node scripts/stoat-issue-invite.mjs --community-code=YOUR_AUTHORIZED_COMMUNITY_CODE --expires-in=86400
node scripts/stoat-integration.mjs
```

Kurulum tekrar çalıştırılabilir; mevcut anahtar/ayarı korur. Özel sır üretir, örnek RabbitMQ/MinIO parolalarını değiştirir, `invite_only` açar. Dosyalar 0600, dizin 0700 olur. Sanal makine yeniden başlatma, seccomp değişimi veya ilgisiz Docker değişimi yapmaz.

Yerel LiveKit webhook ayarı: `node scripts/stoat-configure-media.mjs`; uygulamak için yalnız sahip olunan SFU yeniden başlatılır. İlk kayıtta betik çalıştı fakat SFU yeniden başlatılmadı. Konteynerler aynı SDK API anahtarıyla erişilebilir iç aracı webhook URL'sini kullanmalıdır.

Açık geliştirme `http://127.0.0.1:3021` (REST `/api`, websocket `/ws`, yerel yetki kasası sağlayıcı sürümü 1); özel ham API `http://127.0.0.1:3022`; yalnız geliştirme Mongo yerel portu 3023. `.local/stoat/broker.env` aracı ayarını içerir. Üretimde genel veritabanı yöneticisi yerine yalnız account_invites ekleyebilen Mongo hesabı kullanın. `STOAT_INTERNAL_URL` özel ham kaynaktır; konteynerde iç API kaynağı kullanılır. Açık vekil `/rooms-access` yolunu 3002, `/rooms-activities` yolunu 3031'e iletir. Üretim alan adı, HTTPS/WSS, Mongo erişimi, değişmez imaj özeti ve dağıtım bilgileri yayından önce sağlanıp doğrulanmalıdır.

Gerçek doğrulama özel 0600 `.local/stoat/test-accounts.json` ister: açık temel adres, e-posta/parolalı owner/guest/outsider nesneleri, spaceId/textId/voiceId. `ROOMS_STOAT_TEST_ACCOUNTS` başka sahip olunan özel dosya seçebilir. Betik gerçek Ready, üyelik, mesaj gönder/düzenle/sil olayları, çevrimiçi durum, oturum geri yükleme ve yetkisiz üçüncü kullanıcıyı sınar; yalnız temizlenmiş sonuç yazar. Dosya/çalışma ortamı yokken örnekle başarı üretilmez.

## İzin uygulaması

Medya yetkisi resmî REST'ten gerçek güncel kullanıcı/kanal/sunucu/üyeyi alır. Gerçek ses yapılandırmalı sunucu TextChannel, tam üyelik kimliği, ViewChannel ve Connect gerekir. Stoat rol sırası, kanal istisnası, zaman aşımı, moderatör can_publish/can_receive ve Speak/Video/Listen bayrakları iz/kaynak/abonelik iznini belirler. Sahip için de üyelik/kanal/sunucu kimliği gerekir. Her etkin yetki 10 saniyede yeniden denetlenip güncellenir; kayıp üyelik/erişim katılımcıyı çıkarır.

Aracı `participant_joined` webhook'unu resmî SDK imzası ve tam ham gövdenin SHA-256'sıyla doğrular. Bilinmeyen/iptal edilmiş yetki, aracı yeniden başlatmadan önceki JWT gelişi dahil SFU API'siyle çıkarılır. İzinli katılımcı güncel izin alır. Yeniden kullanılan beş dakikalık JWT webhook işlenene kadar kısa bağlanabilir; bu sınırlı eşzamansız çıkarma, anlık kriptografik iptal değildir. On saniyelik tarama ek kontroldür. Gerçek iki istemcili Stoat medya iptali ayrıca kabul gerektirir.

## 8 Ekim 2026 kanıtları

- Ana istek ve iki referans değişiklikten önce tam okundu.
- Resmî API/model/protokol main ve v0.15.5 üzerinde incelendi; izin önceliği sabit etiketle karşılaştırıldı.
- `docker info --format '{{.ServerVersion}}'`: başarısız, OrbStack soketi yoktu; çalışma ortamı değiştirilmedi.
- `node scripts/stoat-setup.mjs`: başarılı; özel ayar üretildi, sır yazdırılmadı.
- `.local/stoat` içinde `docker compose config --quiet`: başarılı; konteyner başlatılmadı.
- `node scripts/stoat-start.mjs`: Docker olmadığı için engelli.
- `node scripts/stoat-issue-invite.mjs --community-code=fixture-unverified-only`: veritabanı olmadığı için engelli; davet üretilmedi.
- `node scripts/stoat-integration.mjs`: gerçek test hesabı ayarı olmadığından engelli; örnek başarı sayılmadı.
- `pnpm typecheck`: entegrasyonda başarılı; eşzamanlı değişiklik sonrası son tekrar ayrıca gerekiyordu.
- `node scripts/build-access.mjs` ve `node scripts/build-electron.mjs`: başarılı.
- 8 Stoat izin/kaynak, 11 bağdaştırıcı protokol, 4 kalıcı kayıt örnek testi başarılı. Aynı kaynaklı multipart baytları ve sabit bot yanıt başlıkları kapsandı. İmzalı webhook/bilinmeyen katılımcı testleri SDK imzası ve işaretli HTTP SFU örneği kullanır. Bot bahsetme süzgeci de geçti. Bunlar üst sistem kabulünden ayrıdır.

## Ayrı doğrulanacak kabul

Gerçek hesap kaydı/e-posta/kısmi kayıt kurtarması; çalışan vekilde davet süresi/tek kullanım; iki hesapla mesaj/DM/arkadaş/çevrimiçi/moderasyon; ek/tepki/profil arayüzü; websocket yeniden bağlanma/Ready/okundu; Stoat üyelik medya yetkisi/moderatör susturma/sağırlaştırma/iptal; iki fiziksel Mac; üretim imza/dağıtım/geri dönüş. İlk kayıt gerçek Stoat entegrasyonu veya ekran görüntüsü iddia etmez; sonraki testler ayrıca kaydedilmelidir.

## Resmî bot bağlantısı

Agent Stoat botu resmî `x-bot-token` REST ve ağ geçidi belirteci kullanır. `/users/@me` sonucunun bot olduğunu denetler; bot/kendi/sıradan mesajları yok sayar, gerçek bahsetme üstverisi ve yetkili insan yazar ister, göreve aktarır. Sese katılmaz. v0.15.5 users/rocket.rs ve bonfire/websocket.rs bot yetkisi için incelendi; canlı bot bilgileri/uçtan uca sonuç ayrıca doğrulanmalıdır.

## Eklenen sosyal yetenekler

Yerel API gerçek arkadaş/gelen/giden/engelli ilişkileri, resmî username#discriminator istek/kaldırma, kendi ad/biyografi/durum değişimi, ağ geçidi yenilemeli tepki ekle/kaldır, ek üstverisi ve kontrollü yüklemeyi destekler. Dosya seçimi açık yerel iletişim kutusu, destekli medya/belge uzantısı, boş olmayan en fazla 25 MiB ve değişen dosyayı reddeden sınırlı tanıtıcı okuması kullanır. Yüklenen kimlikler seçilen konuşmaya bağlı, hesap değişiminde temizlenir; ham yol preload'dan geçmez. Seçimi kaldırmak yerel gönderme yeteneğini bırakır; kullanılmayan üst baytların temizliği üst sisteme aittir. Yalnız ekli mesaj mümkündür. Keşfedilen Autumn adresi oturum başlığı/bayt almadan önce tam yapılandırılmış Stoat kaynağına eşit olmalı, kimlik bilgisi/sorgu/parça içermemelidir. Görünüm indirme üstverisi yalnız aynı kaynaklı açık ek yolu taşır, belirteç taşımaz.

Çevrimiçi durum gerçek Ready bayrağı ve UserUpdate olayından başlar. Yerel abonelik yalnız ana pencere odaklıyken gönderilir, en sık 10 dakikada yenilenir; üst sistem 5 etkin/15 dakika sınırları uygulanır. Gerçek iki istemci olmadan canlı durum kanıtlanmaz.

Ayrı sıralarda rol önceliği sabit üst sürümü izler. Aynı sıradaki çelişkili istisnalarda üst HashMap sırası belirsiz olduğundan aracı o sırada reddi öncelikli alır; fazla ses izni verme riskini önler. İki üye rol sırası da örnek testlidir.

Sosyal/profil/tepki/yükleme başarılı yolları protokol örneği ve yerel derleme kontrolüne sahiptir. İlk kontrolde gerçek sunucu yoktu; canlı entegrasyon ve masaüstü sınanmadan doğrulanmış sayılmaz.

## Yetkili okundu geri yüklemesi

Sabit v0.15.5 [eşzamanlama yolu](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/delta/src/routes/sync/get_unreads.rs), `/sync/unreads` üzerinden kullanıcının kendi kanal kayıtlarını verir. [ChannelUnread](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/models/src/v0/channel_unreads.rs), toplam okunmamış sayısı değil `last_id` ve bahsetme mesaj kimlikleri içerir. Yerel `readStates()`, normalleştirilmiş `SocialReadState` döndürür. Her gerçek Ready/yeniden bağlantı bunları çekip `READ_STATE_SYNC` üretir; güncel kullanıcı ChannelAck ve başarılı yerel onay yeniden çeker. Başkasının onayı kendi durumu ezmez. Kanallar gerçek `last_message_id` değerini `lastMessageId` olarak verir.

Eksik kayıt veya başarısız/desteksiz eşzamanlama bilinmiyor demektir; sıfır uydurulmaz. Hata `READ_STATE_UNAVAILABLE` üretir. Yerel depoyla üst okundu geri geldiği iddia edilmez. Kendi kullanıcı süzme, resmî onay yolu, onay sonrası yetkili yeniden çekme ve geçersiz yanıt örnek testlidir. Gerçek yeniden bağlantı/okundu ayrı canlı kabul ister. Yerel mesaj bildirimi girişli kullanıcıyı ve normalleştirilmiş metin `author.id` değerini denetler, kendi mesajını dışlar; ham sağlayıcı yazar alanına bakmaz.
