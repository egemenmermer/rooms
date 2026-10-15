# Ayrı sunucuda ROOMS Agent kurulumu

Bu rehber ayrı Linux sunucusundaki Docker arka ucunu anlatır. Aynı fiziksel sunucuda çalıştırmak için bunun kurallarını gevşetmeyin; ayrı tasarlanmış [yetkisiz Podman arka ucunu](../infra/agent/shared/README.md) kullanın. Masaüstü yetkili görevleri gönderir, ilerleme ve sonuçları alır. Ayrı Agent sunucusunda Core veritabanı kimlik bilgileri, kişisel IPTV/Real-Debrid kasası, masaüstü dosya sistemi bağlantısı veya Core özel ağına bağlantı bulunmamalıdır. İlk uygulama sırasında üretim sunucusu veya harici kimlik bilgisi sağlanmamıştı; aşağıdaki test sınırları o kontrol noktasını anlatır.

## Kurulum ve hazırlık

`pnpm services:build` ile derleyin. Ayrı sunucuya Node.js ve Docker kurun; `dist-services/agent.cjs` dosyasını UID 10001 olan ayrı servis kullanıcısıyla çalıştırın. `/var/lib/rooms-agent` bu kullanıcıya ait, 0700 izinli olmalıdır. Çalışma alanı, model evi ve tarayıcı profili bağları konteynerde UID 10001 kullanır; root'a ait 0700 dizinler çalışmaz. Sunucu servisi Docker erişimi ister; bu ayrıcalıklı bir sunucu yetkisidir. Docker soketini çalışanlara bağlamayın veya servisi rastgele istemcilere açmayın.

Çalışanı `docker build -t rooms-agent-worker:local -f infra/agent/worker.Dockerfile infra/agent` ile kurun. İmaj resmî Codex 0.161.0, Claude Code 2.1.293 ve Playwright 1.64.0 belirtir. Üretimden önce onaylı taban imaj özetlerini çözümleyip sabitleyin. İlk kontrol noktasında ayrı Linux sunucusunda bu imaj derlenip çalıştırılmamıştı.

TLS ters vekil kullanın; servis yerel 3041 portunda kalsın. `SERVICE_HOST` ve `AGENT_PORT` varsayılanları değiştirir. Şu özel değerleri sağlayın:

- `ROOMS_AGENT_STORAGE_KEY`: kaynak dışında kalıcı, rastgele 32 baytlık onaltılık şifreleme anahtarı.
- `ROOMS_AGENT_AUTH_FILE`: 0600 izinli `{userId,roomIds,canManage,tokenSha256,enabled}` yetki nesneleri içeren JSON dizisi. Kişiye ayrı rastgele 256 bit erişim belirteci verin; burada SHA-256 özetini saklayın. HTTP yetkisi, çalıştırma ve bildirim tesliminde yeniden okunur.
- `ROOMS_AGENT_DATA`: isteğe bağlı 0700 veri dizini; varsayılan `/var/lib/rooms-agent`. Şifreli atomik depo bağlantı, görev, kontrol noktası, hafıza, giden kutusu ve denetim kayıtlarını içerir.
- `ROOMS_AGENT_WORKER_IMAGE`: isteğe bağlı imaj; varsayılan `rooms-agent-worker:local`.
- `ROOMS_AGENT_POLICY_FILE`: aşağıdaki gibi isteğe bağlı 0600 JSON politika. Yoksa çalışan ağı ve harici bağlayıcı kapsamları kapalıdır.
- `ROOMS_AGENT_CONNECTORS_FILE`: ayrı bot kimlik bilgileri ve kesin depo/klasör izin listeleri içeren isteğe bağlı 0600 JSON. Belirteçler isteme, görünüm verisine veya çalışan bağlarına girmez.

Örnek politika:

```json
{
  "version": 1,
  "networkName": "rooms-agent-egress",
  "egressVerified": false,
  "allowedResearchHosts": ["example.org"],
  "browserHosts": ["example.org"],
  "connectorScopes": ["github.read", "github.write", "drive.read", "drive.write"]
}
```

Örnek bağlayıcı yapılandırması:

```json
{
  "githubToken": "DEDICATED_BOT_TOKEN",
  "githubRepositories": ["organization/repository"],
  "driveOAuth": {
    "clientId": "BOT_OAUTH_CLIENT_ID",
    "clientSecret": "BOT_OAUTH_CLIENT_SECRET",
    "refreshToken": "DEDICATED_BOT_REFRESH_TOKEN"
  },
  "driveFolderIds": ["AUTHORIZED_FOLDER_ID"]
}
```

Bunlar gerçek kimlik bilgileri değil örneklerdir. Drive, ayrı `driveOAuth` veya yedek `driveToken` erişim belirteci kullanabilir. OAuth yenileme yalnızca `https://oauth2.googleapis.com/token` kullanır, kimlik bilgili yönlendirmeyi reddeder, yanıt boyutu/ömür sınırı koyar; erişim belirtecini sona ermeden kısa süre öncesine kadar yalnızca servis belleğinde tutar. Yenileme bilgileri model argümanlarına, görünüm verisine veya çalışan bağlarına girmez. API reddi önbelleği geçersizleştirir; değişiklik yapabilecek işlemi otomatik tekrarlamaz. Yalnız erişim belirteci ayarı süre bitimi/iptali açık bildirir; gerektiğinde özel belirteci yenileyin. GitHub sınırlı içerik okuma, issue, beklenen commit SHA ile dosya yazma ve taslak PR destekler. Drive izinli klasörde listeleme/okuma/metin oluşturmayı destekler. Yetenek üstverisi canlı sağlayıcı doğrulamasını değil yapılandırılan kapsamı gösterir.

[Google'ın resmî çevrimdışı OAuth akışını](https://developers.google.com/identity/protocols/oauth2/web-server#offline) izleyin. Ayrı bot hesabı için uygun en düşük Drive kapsamını ve çevrimdışı erişimi kullanarak resmî onay akışını yönetsel olarak tamamlayın. İstemci kimliği/sırrı ve yenileme belirtecini yalnız 0600 bağlayıcı dosyasına koyun. ROOMS tarayıcı onay geri dönüşü sağlamaz veya bunları görünümden toplamaz. Gerektiğinde Google hesap/projesinden iptal edin veya döndürün, ardından servisi yeniden başlatın. Klasör izin listesi yenilemeden sonra da zorunludur. Canlı hesapla OAuth onayı, yenileme ve Drive çağrıları bu ilk uygulama kontrolünde denenmedi.

## Sınırlı ağ

Kod konteynerlerinde varsayılan `--network none` olur. Resmî CLI giriş/çalıştırma ve tarayıcı görevleri `ROOMS_AGENT_WORKER_NETWORK=enabled` ile `egressVerified:true` gerektirir. Başlangıç yalnızca köprü adı `br-rooms-agent` olan iç `rooms-agent-egress` ağını kabul eder.

`ROOMS_EGRESS_HOSTS_FILE` değerini kesin HTTPS alan adları içeren 0600 JSON dizisine ayarlayın, sonra `docker compose -f infra/agent/compose.yml up -d --build` çalıştırın. Kısıtlı CONNECT vekili, iç çalışan ağı ve ayrı dış bağlantıyla başlar; sunucu portu açılmaz. Gerekli sağlayıcı/giriş/araştırma/tarayıcı alanlarını ekleyin; joker karakter yoktur. Vekil 443 portunu kabul eder, DNS'den çözülen açık IP'yi sabitler, özel/ayrılmış adresleri reddeder, bağlantı ve süre sınırı uygular. Çalışan ortamı ve Chromium `http://rooms-egress:3128` kullanır.

Docker iç ağı politikanın yalnızca bir parçasıdır. Sunucu güvenlik duvarında `br-rooms-agent` kaynaklı INPUT'u ve kurulmuş yanıtlar ile vekilin iç adresine TCP 3128 dışındaki çalışan yönlendirmesini/doğrudan çıkışı reddedin. IPv4, IPv6, köprü trafiği ve sunucu ağ geçitlerini kapsayın. Vekilin dış bağlantısı çalışan üyeliğinden ayrı kalsın. Çalışan içinden doğrudan açık IP, sunucu/özel/link-local adres, izinsiz alan, 443 dışı tünel, UDP ve Core adreslerinin reddedildiğini; izinli vekil HTTPS'nin çalıştığını sınayın. Yalnız kayıtlı kontrol sonrası `egressVerified:true` yapın. Başlangıç topolojiyi denetler; güvenlik duvarını onaylayamaz. Bu ilk uygulamada canlı sunucu güvenlik duvarı/çıkış testi yapılmadı.

Aracının araştırması kesin alan listesi, DNS'ye sabitlenmiş açık adres, sınırlı okuma ve yönlendirme denetimi kullanır. Bağlayıcılar kesin depo/klasör kapsamıyla sağlayıcı API alanında kalır. Çalışanlar yetenekleri kaldırır, ayrıcalık yükseltmeyi yasaklar, CPU/bellek/süreç sınırı koyar, salt okunur kök ve sınırlı geçici depolama kullanır. Yalnız görev alanı ve CLI görevinde başlatan modelin özel yetki evi bağlanır.

## Model hesapları ve araçlar

Her kullanıcı kendi bağlantısına sahiptir. OpenRouter anahtarları diskte şifrelidir. Görevleri sınırlı dosyalar, yalıtılmış kod, izinli araştırma, kalıcı bot tarayıcısı ve yapılandırılmış GitHub/Drive için kalıcı aracı araç döngüsünü kullanır. Her model/araç adımı güncel oda/kullanıcı erişimini yeniden denetler. Kayıtlı bağlantı yapılandırmayı, başarılı gerçek çağrı sağlayıcı erişimini kanıtlar.

Codex/Claude aboneliklerinde hesap sahibi ayrı sunucuda UID 10001 olarak resmî giriş yapar:

```sh
node scripts/agent-model-login.mjs codex OWNER_ID CONNECTION_ID
node scripts/agent-model-login.mjs claude OWNER_ID CONNECTION_ID
```

Yardımcı iç ağ/vekili ve sahip/bağlantı başına ayrı resmî yetki evini kullanır. ROOMS OAuth oturum belirteci veya hesap parolası toplamaz. Sağlayıcının desteklenen giriş/abonelik kurallarını kontrol edin. Yetki dosyasının varlığı güncel oturumu kanıtlamaz. Abonelikleri ortak havuz yapmayın.

Resmî CLI görevleri OpenRouter aracısının GitHub/Drive veya kalıcı bot tarayıcısını kullanmaz. Yalıtılmış alan ve yapılandırılmış ağda CLI'nin kendi kod/araştırma davranışını çalıştırır. Yetenekler ayrıdır. Canlı sağlayıcı giriş/çalıştırma kabulü ayrıca gerekir.

## Onay, devam ve hafıza

Yetkili yöneticiler genel YOLO ayarını yönetir. Yapılandırılmış kapsam içinde onayı atlar; bağlantı, bağ veya yetki ekleyemez. Normal görev başlangıç onayı ve dosya yazma, kod, tarayıcı eylemi, dış yazma gibi değişiklikler için işlem bazında onay ister. Onay tam kayıtlı işlemi sürdürür. Okumalar da yetkiyi yeniden kontrol eder.

Şifreli kontrol noktaları yan etkiden önce model mesajlarını ve işlem defterini saklar. Tamamlanan işlem devamda tekrar kullanılmaz, sonucu kullanılır. Güvenli kesilmiş okumalar devam edebilir; başlamış/belirsiz yazmalar kesilmiş kalır ve tam işlem kimliği için `record-result` veya `confirm-not-applied` uzlaştırması ister. Uygulanmadığını onaylamadan dış sistemi kontrol edin. Kör tekrar yoktur. CLI çağrıları da kalıcı defter ve belirsiz çalışmada elle uzlaştırma kullanır. İptal HTTP işini keser ve yalıtılmış çalışanları açıkça kaldırır.

Tek seferlik zamanlamalar kalıcıdır; oda erişimi/model sahipliği yeniden denetlenir. Biten görev bitmiş kalır. Bota yöneltilen istem/sonuç oda hafızasına girer; sıradan mesaj için elle açık kaydetme gerekir. Yetkili oda kullanıcıları hafızayı inceleyebilir/silebilir.

Kalıcı yalıtılmış bot tarayıcısı sıralı eylem kuyruğu kullanır. DOM/çerezler görevler arasında kalabilir; profil kod/CLI çalışanına bağlanmaz. Eylemler yapılandırılmış HTTPS alanları gerektirir; parola/belirteç alanı doldurma reddedilir. Bot oturumunu yönetsel kurun: etkileşimli tarayıcı giriş kurulum akışı uygulanmamıştır. Gerçek Linux tarayıcı davranışı ayrıca doğrulanmalıdır.

## Yalnızca bahsetmeyle bot teslimi

İsteğe bağlı ayrı hesaplar `ROOMS_STOAT_BOT_URL`, `ROOMS_STOAT_BOT_TOKEN`, `ROOMS_STOAT_BOT_MAPPING_FILE` ve/veya `ROOMS_DISCORD_BOT_TOKEN`, `ROOMS_DISCORD_BOT_ID`, `ROOMS_DISCORD_MAPPING_FILE` kullanır. Eşleme dosyaları 0600 JSON dizileridir:

- Stoat: `{authorId,channelId,userId,roomId,modelConnectionId}`.
- Discord: `{discordAuthorId,channelId,userId,roomId,modelConnectionId}`.

Yalnız eşlenmiş yetkili bahsetme işi kuyruğa alır. Bot sese katılmaz veya sıradan mesajları toplamaz. Yazar kimliği eklemek ağ geçidini yeniden başlatmayı gerektirir; değişiklik/iptaller her bahsetme ve teslimde yeniden okunur. Değişmez kaynak yazar/kanal/mesaj görevle saklanır; teslimde güncel eşleme ve yetkiyle hâlâ uyuşmalıdır.

Kalıcı giden kutusu, resmî bot API yanıtından önce onay isteklerini/sonuç/hataları kaydeder. Sabit nonce/kimlikler sağlayıcıda sınırlı tekrar önlemeye yardım eder; kalıcı tam bir kez teslim garantisi vermez. Gönderim sonrası hata ve yeniden başlatmada gönderiliyor kalan kayıt belirsiz olur, otomatik tekrarlanmaz. Yetkili `/v1/outbox?roomId=...` üzerinden inceleyip elle uzlaştırın. Üretim hesabı/canlı teslim bu ilk uygulamada sınanmadı.

## Sıradan mesaj hatırlatmaları

`POST /v1/reminders`, `{roomId,channelId,sourceMessageId,text,runAt}` kabul eder. Açık not/zaman/kaynak gönderimi tek hatırlatmayı yetkilendirir; model bağlantısı/onayı gerekmez. Görevde `kind:reminder`, eski model bağlantısı alanında boş değer bulunur. Servis oluşturma, zamanı gelme ve teslimde güncel oda yetkisi, Stoat eşlemesi, resmî bot kimliği ve tam kaynak mesajı doğrular. Kullanıcı durumu yalnız güncel eşlenmiş bot varsa `stoat-reminders` gösterir.

Hatırlatma giden kutusuyla özgün mesaja yanıt verir. Model çağırmaz; sıradan mesaj/hatırlatma metnini bot hafızasına koymaz. Zamanlanmış/bekleyen kayıtlar yeniden başlatmada korunur; gönderilen tamamlanmış kalır. Beklerken iptal edilen gönderilmez; yetki/eşleme iptali veya kaynak silinmesi teslimi durdurur. Gönderim başladıktan sonraki iptal uzak mesajı geri çağıramaz. Gönderiliyor/bilinmeyen sonuç kesilmiş kalır, otomatik tekrarlanmaz. Sınırlı nonce tekilleştirmesi ağ düzeyinde tam bir kez garantisi değildir. Belirsiz hatırlatmanın yerine yenisini oluşturmadan kaynak sohbeti kontrol edin. Canlı bot teslimi ayrı dağıtım kabulüdür.

## Kanıt ve kalan dağıtım koşulları

Gerçek yerel HTTP testleri yetkiyi, oda/kullanıcı model sahipliğini, şifreli kalıcılığı, onay/devamı, belirsiz yazma uzlaştırmasını, YOLO kapsamını, zamanlama/bahsetme/belirsiz giden kutusunu kapsar. Araç döngüsü adlandırılmış test model aktarımı, bağlayıcı testleri sağlayıcı HTTP yanıtı kullanır. Çekirdek davranışı kanıtlar; canlı OpenRouter/GitHub/Drive/CLI/bot/Docker/tarayıcı entegrasyonunu değil.

Üretim kabulünden önce gerçek imaj derlemesi, UID/bağ izinleri, ağ reddetme matrisi, her canlı model/araç çağrısı, bot yanıtları, tarayıcı kalıcılığı, iptal, belirsiz işlem kurtarma ve şifreli yedekten dönüş kaydedilmelidir. Şifreli veri ve anahtarı ayrı yedekleyin. Yerel testler Hetzner'de çalışmayı veya dış entegrasyonu doğrulamış sayılmaz.

## Sürümlü dağıtım kiti

`node scripts/package-agent.mjs` yalnız Agent servisini derler; açık izin listeli çalışan/vekil kaynakları, resmî giriş/erişim yardımcıları, kurulu bağımlılık bildirimleri, bu rehber ve systemd birimini paketler. Çıktı `.local/deployment/rooms-agent-VERSION.tar.gz` ve SHA-256 dosyasıdır. Kimlik bilgisi, özel profil, Core ayarı veya veri dökümü içermez. `MANIFEST.json` kaynak/paket özetini kaydeder; kabul kanıtı değildir. Paketleme Docker/CLI/ayrı sunucuyu kurup sınamaz.

Ayrı Linux sunucusunda Node.js 22+ `/usr/bin/node` yoluna ve Docker kurun. `rooms-agent` UID/GID 10001, Docker grubu üyesi olsun; bu UID başka kişiye aitse sunucuyu böyle kullanmayın. Güvenilir kiti `/opt/rooms-agent` altına açın, çalıştırılabilir kod root'a ait kalsın. `/var/lib/rooms-agent` UID/GID 10001, 0700; `/etc/rooms-agent` root, grup 10001, 0750 olsun. Ortam/yetki/politika dosyaları UID/GID 10001, 0600 olmalıdır. Örnek yetki kimseye izin vermez, politika dış kapsam/ağı kapatır; anahtar yer tutucusu gerçek kalıcı anahtar verilene kadar başlangıcı bilerek engeller.

`infra/agent/rooms-agent.service` dosyasını `/etc/systemd/system` altına kurun. Yerel bağ için yukarıdaki TLS vekili gerekir; birim açık port açmaz. Çalışan/vekil imajlarını ayrı sunucuda kurun, şifreleme anahtarını sunucu dışında koruyun, verilen yardımcıyla kişiye özel erişim verin; ardından servisi açın. systemd sınırlarına rağmen Docker erişimi ayrıcalıklıdır; çalışanlara soket verilmez. Sahip belgelenen ağ kabulünü tamamlamadan `egressVerified:true` veya çalışan ağı açılmamalıdır. Kit gerçek kurulum/canlı sağlayıcı doğrulaması yapmış sayılmaz.
