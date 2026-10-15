# iPhone bildirimleri

Uygulama kapalıyken iPhone'a bahsetme ve özel mesaj bildirimi gönderir.

## Nasıl çalışır

1. iPhone uygulaması girişten sonra bildirim izni ister. İzin verilirse Apple'dan aldığı cihaz belirtecini Stoat'ın `POST /push/subscribe` uç noktasına `endpoint: "apn"` ile kaydeder. Kayıt oturuma bağlıdır; çıkış yapınca oturumla birlikte silinir.
2. Stoat `pushd`, bildirim alması gereken kullanıcıları kendisi belirler: bahsetmeler, özel mesajlar ve kullanıcının bildirim ayarları. `apn` aboneliklerini `revolt.notifications` değişimindeki `notifications.outbound.apn` yönlendirme anahtarına gönderir.
3. Upstream `pushd` APNs istemcisi konuyu `chat.revolt.app` olarak sabitler, bu yüzden ROOMS uygulamasına gönderemez. Stoat'ı çatallamak yerine `apps/services/apns` aynı yönlendirme anahtarını `rooms.apns-relay` kuyruğuyla dinler ve bildirimi ROOMS paket kimliğiyle Apple'a iletir.
4. `pushd` için APNs anahtarları boş kalmalıdır. Aksi halde iki tüketici aynı bildirimi yarışarak işler.

Bildirim yalnızca yazar, kanal adı ve `pushd`'nin hazırladığı metni içerir. Kanal ve mesaj kimlikleri dokununca doğru sohbeti açmak için eklenir. Belirteçler ve mesaj içerikleri günlüğe yazılmaz; servis saatte bir yalnızca sayıları yazar.

## Kurulum

1. Apple Developer → Certificates, Identifiers & Profiles → Keys bölümünde **Apple Push Notifications service (APNs)** etkin yeni bir anahtar oluştur. `.p8` dosyasını indir ve Key ID'yi not et. Dosya yalnızca bir kez indirilebilir.
2. `com.egemenmermer.rooms.mobile` App ID'sinde Push Notifications yeteneği açık olmalı. Xcode otomatik imzalama bunu ilk cihaz derlemesinde ekleyebilir.
3. Sunucuda `.p8` dosyasını `config/private/apns.p8` olarak 0400 izniyle yerleştir. `config/apns.env` içine `ROOMS_APNS_KEY_ID`, `ROOMS_APNS_TEAM_ID` ve `ROOMS_AMQP_URL` (RabbitMQ kullanıcısı ve şifresiyle `amqp://…@rabbit`) değerlerini yaz. Bu dosyaları commit etme.
4. `pnpm services:build` ile `dist-services/apns.cjs` dosyasını üret, `infra/apns.Dockerfile` ile imajı oluştur ve `infra/apns-compose.fragment.yml` parçasını özel Compose yapılandırmasına ekle.

`ROOMS_APNS_ENVIRONMENT=auto` önce üretim ortamını dener. Xcode ile kurulan geliştirme derlemelerinin belirteçleri için sandbox'a bir kez döner ve sonucu belirteç başına hatırlar.

## Kabul

Birim testleri ve derleme fiziksel teslimatı kanıtlamaz. Gerçek kabul için:

- Uygulama kapalıyken başka bir hesaptan `@` ile bahset ve bildirimin geldiğini doğrula.
- Bildirime dokununca doğru kanalın açıldığını doğrula.
- Aynı kanal açıkken bildirimin gösterilmediğini doğrula.
- Çıkış yaptıktan sonra bildirim gelmediğini doğrula.
- Bildirim izni reddedildiğinde uygulamanın normal çalıştığını doğrula.
