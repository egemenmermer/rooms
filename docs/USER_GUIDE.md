# ROOMS kullanım rehberi

[← README](../README.md) · [Sunucu kurulumu](SELF_HOSTING.md) · [Sorun giderme](TROUBLESHOOTING.md)

## İçindekiler

- [Başlamadan önce](#başlamadan-önce)
- [Topluluğa katıl](#topluluğa-katıl)
- [Ekranları tanı](#ekranları-tanı)
- [Sohbet ve kişiler](#sohbet-ve-kişiler)
- [Ses ve ekran paylaşımı](#ses-ve-ekran-paylaşımı)
- [Ortak etkinlikler ve müzik](#ortak-etkinlikler-ve-müzik)
- [Roller ve yönetim](#roller-ve-yönetim)
- [Ayarlar ve güncellemeler](#ayarlar-ve-güncellemeler)
- [Gizlilik ve destek](#gizlilik-ve-destek)

## Başlamadan önce

Topluluğu yöneten kişiden şunları al:

1. Uyumlu ROOMS uygulaması veya kaynak koddan çalıştırma adımları. Hazır masaüstü paketleri [sürümler sayfasındadır](https://github.com/egemenmermer/rooms/releases/latest).
2. Topluluğun sunucu adresi; genellikle bir HTTPS adresidir.
3. Yeni hesap için davet veya mevcut hesabının bu sunucuda bulunduğuna dair bilgi.

Evrensel bir ROOMS hesabı yoktur. Başka bir topluluğun sunucusuna bağlanmak hesabını, mesajlarını veya izinlerini otomatik taşımaz. GitHub hesabın da ROOMS hesabı değildir.

Platform ve imza bilgisini indirdiğin sürümün notlarından kontrol et. Issue yorumlarındaki bilinmeyen çalıştırılabilir dosyaları indirme; kaynak kod arşivini kurulum paketi sanma. Kendi paketini dağıtacaksan [sürüm rehberini](RELEASING.md) izle.

## Topluluğa katıl

1. Platformuna uygun masaüstü paketini kurup aç veya [kaynaktan çalıştır](DEVELOPMENT.md).
2. Yöneticinin davet bağlantısını aç ya da başlangıç ekranında sunucu adresini gir. Uygulama davetleri `rooms:` şemasını kullanabilir; işletim sisteminin bunları açabilmesi, protokolü kaydeden bir masaüstü paketinin kurulmasına bağlıdır.
3. O sunucuda hesabın varsa giriş yap. Yoksa yönetici tarafından verilen kayıt davetiyle hesabını oluştur. Upstream Stoat daveti ve ROOMS kayıt bileti farklıdır; yöneticiden ROOMS davetini iste.
4. Profil ve cihaz kurulumunu takip et. Mikrofon, kamera ve ekran erişimini yalnızca ilgili özelliği kullanırken ver.
5. Erişebildiğin topluluğu ve kanalı seç. Görebildiklerin ve yapabileceklerin üyeliğine ve rolüne bağlıdır.

Davetin süresi dolmuşsa, kullanılmışsa veya kayıt yarıda kaldıysa yöneticiden durumu inceleyip uygun bir yenisini vermesini iste. Sürekli yeniden denemek, kısmen oluşturulmuş bir hesabı güvenle onarmaz.

Kaynaktan alınan derleme hazır sunucu adresi olmadan başlar. Bu beklenen davranıştır; yöneticinin adresini gir. Boş alan, eksik bir merkezî ROOMS hizmeti olduğu anlamına gelmez.

## Ekranları tanı

![Topluluk ana sayfası](images/home.png)

- **Ana sayfa:** topluluk özeti, konuşmalara ve etkinliklere giriş.
- **Kanallar ve konuşmalar:** kullanmak istediğin metin veya ses alanını seç.
- **Kişiler:** topluluk üyeleri ve desteklenen arkadaşlık/özel mesaj işlemleri.
- **Etkinlikler:** gereken servisler etkinse ortak araçlar ve oyunlar.
- **Ayarlar:** hesap bağlantıları, cihaz tercihleri, görünüm ve masaüstü davranışı.

Görüntüler örnek topluluk verileriyle hazırlanmıştır. Etiketlerin yeri ve metni sürümler arasında değişebilir.

## Sohbet ve kişiler

![Sohbet](images/chat.png)

Bir metin kanalı seç, mesajını yaz ve gönder. Mesaj geçmişi seçtiğin sunucudadır. Düzenleme, silme, tepki, dosya ve üye işlemleri; sunucunun yanıtına ve izinlerine bağlıdır.

Dosyalar yerel dosya seçiciden alınır. Mevcut yükleme sınırı desteklenen belge/medya türlerini kabul eder, boş dosyayı reddeder ve dosya başına 25 MiB sınırı uygular. Sunucu ek kısıtlar koyabilir. Yükleme hatası, mesajın başarıyla gönderildiği anlamına gelmez.

Profiller, arkadaşlar ve özel mesajlar seçilen arka ucun kimliklerini kullanır. Bir kişi görünmüyorsa veya işlem reddediliyorsa yöneticiyle topluluğu, hesabını ve rolünü kontrol et. Kişi etiketlerken listeden doğru kullanıcıyı seç; aynı görünen adlar farklı hesaplara ait olabilir.

## Ses ve ekran paylaşımı

![Ses odası](images/voice.png)

1. Katılmaya yetkili olduğun ses özellikli kanalı seç.
2. Uygulamanın bağlantıyı kurduğunu bildirmesini bekle.
3. Mikrofon ve çıkış cihazını seç. Mikrofonunu açıkça etkinleştir; bağlanmak işletim sistemi yakalama iznini kendiliğinden vermez.
4. Sesini göndermek istemediğinde mikrofonu kapat. Sağırlaştırma gelen sesi keser ve mikrofonu da kapatır. Sesi geri açmak mikrofonu otomatik açmaz.
5. Görüntü göndermek istediğinde kamerayı aç.
6. Paylaşım kontrolünden yerel seçicide ekran veya pencere seç. Bitirdiğinde paylaşımı durdur. Yayıncının izniyle uzaktan kontrol özelliği ayrıca yetkilendirilir; yalnızca yayını izlemek bilgisayarı kontrol etme hakkı vermez.
7. Görüşmeyi bitirmek istediğinde ses odasından ayrıl. Başka bir sayfaya gitmek, aktif görüşmeyi sürdürmek için tasarlanmıştır.

Mac'te Sistem Ayarları üzerinden uygulamanın mikrofon, kamera ve ekran kaydı izinlerini kontrol et. İzin değişikliği uygulamayı yeniden açmayı gerektirebilir. Windows cihaz/gizlilik ayarları da geçerlidir. Sistem sesi desteği platforma ve pakete bağlıdır; görüntü paylaşımı, sesin de yakalandığını kanıtlamaz.

Ses gelmiyor veya görüşme bağlanmıyorsa [medya sorun giderme](TROUBLESHOOTING.md#ses-bağlanıyor-ama-duyulmuyor-veya-paylaşım-çalışmıyor) bölümüne bak.

## Ortak etkinlikler ve müzik

Etkinlikler ve oyunlar, yöneticinin Activities servisini gerektirir. Sayfa görünse bile servis veya izin eksikliği nedeniyle kullanılamayabilir.

Topluluk DJ'i ayrı müzik servisi ve desteklenen kaynak erişimi ister. Kuyruk oda/servis tarafından yönetilir; DJ panelini kapatmak kuyruğu iptal etmek için tasarlanmamıştır. Katılımcı ses seviyesi senin dinleme tercihindir. Ortak listelerde düzenleme ve çalma yetkileri topluluğun izinlerine bağlıdır.

Kişisel medya bağlantıları, sana ait yetkili sağlayıcı erişimini kullanır. İçerik başka programda oynasa bile sağlayıcı bu oynatma yolunu reddedebilir. Kimlik bilgilerini veya kişisel yayın adreslerini herkese açık raporlarda paylaşma.

İsteğe bağlı Agent ayrı makine ve açık hesap/kaynak izinleri gerektirir. Normal sohbet ve ses için Agent kurulması gerekmez.

## Roller ve yönetim

Yetkili bir yönetici **Ayarlar → Üyeler ve roller → Roller** bölümünde rol adı, renk ve temel izinleri düzenleyebilir. Kanka, Yayıncı ve Moderatör şablonları düzenlenebilir taslaklardır; seçmek kendiliğinden üyeye yetki vermez. Kaydedilen rol ayrıca üyeye atanır. Ayrıntılar [rol rehberindedir](COMMUNITY_ROLES.md).

Sunucu izleme/terminal gibi yönetim özellikleri normal üyelikten ayrı yetki ister. Core sunucu ile Agent makinesi farklı sistemler olabilir; seçtiğin makineye dikkat et. [Sunucu yönetimi](SERVER_OPERATIONS.md) belgesini izle.

## Ayarlar ve güncellemeler

Cihazlar, görünüm, kişisel bağlantılar ve masaüstü tercihleri için Ayarlar'ı kullan. Hesap parolası ve kimlik bilgileri seçtiğin sunucuya/sağlayıcıya aittir; bu GitHub deposuna değil.

Mac'te uygulama içi güncelleme, dağıtıcının uyumlu besleme ve imzalı paketleriyle çalışır. Kaynaktan derlediğin uygulama kendiliğinden başka bir dağıtıcının kanalına girmez. Güncelleme yoksa veya beklediğinden eski sürüm öneriliyorsa dağıtıcıya sor; imza anahtarını değiştirme, güvenlik kontrolünü aşma veya kişisel oturum/cache dosyalarını gelişigüzel silme.

Windows'ta güncel EXE indirilip kurulur; otomatik Windows güncellemesi yoktur. Kurulumdan önce sürümün platform ve imza notlarını oku.

Varsayılan DJ görseli topluluğa göre değişebilir. Yöneticiler her üyeye kaynak kod düzenletmeden [kendi görsellerini yapılandırabilir](CUSTOMIZATION.md).

## Gizlilik ve destek

Topluluk yöneticisini, sunucuda tutulan verinin yöneticisi olarak değerlendir. Aktarım sırasında şifreleme, uçtan uca şifreleme değildir; burada E2EE yapılandırılmamıştır. Saklama, yedekleme, hesap kurtarma, dışa aktarma ve silme konusunda yöneticine danış.

Sorunda uygulama sürümünü, işletim sistemini, yaptığın işlemi ve görünen hatayı kaydet. Ekran görüntüsü paylaşmadan önce özel mesajları, hesap adreslerini, davetleri ve sağlayıcı bilgilerini kaldır. Topluluk/hesap sorunları için yöneticiye; tekrarlanabilir kaynak kod hataları için depoya başvur. Hassas güvenlik raporlarında [SECURITY.md](../SECURITY.md) yolunu izle.
