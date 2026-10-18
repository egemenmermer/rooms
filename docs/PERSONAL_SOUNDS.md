# Giriş Sesi

[← README](../README.md) · [Mimari](ARCHITECTURE.md) · [Sunucu kurulumu](SELF_HOSTING.md)

Herkes kendi kısa giriş ve çıkış sesini seçebilir. Bir ses odasına girdiğinde içerideki arkadaşların bu sesi duyar; çıktığında kalanlar çıkış sesini duyar. Ses mikrofondan gitmez: her dinleyicinin cihazında yerel olarak çalar ve her dinleyici kendi ayarıyla kapatabilir.

## İçindekiler

- [Kim neyi duyar](#kim-neyi-duyar)
- [Akış](#akış)
- [Sesler ve sınırlar](#sesler-ve-sınırlar)
- [Dinleyici ayarları](#dinleyici-ayarları)
- [Gürültü kuralları](#gürültü-kuralları)
- [Depolama, gizlilik ve moderasyon](#depolama-gizlilik-ve-moderasyon)
- [Doğrulama durumu](#doğrulama-durumu)

## Kim neyi duyar

Çalacak sesi olayı yapan kişinin seçimi belirler. Sesin çalıp çalmayacağına ise dinleyicinin ayarı karar verir. Kimse başka birinin ayarını aşamaz.

| Olay | Çalan ses | Duyanlar | Yapan kişi |
| --- | --- | --- | --- |
| Odaya giriş | Girenin giriş sesi; seçmediyse klasik ses | Kanalda zaten bağlı olanlar | Klasik giriş sesini duyar |
| Odadan çıkış | Ayrılanın çıkış sesi; seçmediyse klasik ses | Kanalda kalanlar | Klasik çıkış sesini duyar ve bağlantısı beklemeden kapanır |

Ekran paylaşımı ve yayın izleme sesleri bu sürümde yok. Kimin izlediği arayüzde zaten görünüyor.

## Akış

1. Kişi Ayarlar → Ses ve video → **Giriş ve çıkış sesin** bölümünden bir ROOMS sesi seçer ya da kendi sesini yükler. Seçim hemen erişim servisinde saklanır ve tüm cihazlarında geçerlidir; sayfadaki Kaydet düğmesini beklemez.
2. Kişi bir ses odasına girerken erişim servisi LiveKit iznini verir. İzne, seçtiği sesin kimliğini sunucuya ait katılımcı özelliği olarak ekler (`rooms.sound.enter`, `rooms.sound.leave`). İstemciler kendi özelliklerini değiştiremez (`canUpdateOwnMetadata: false`). Bu yüzden kimse başkası adına ses çaldıramaz.
3. Odadaki istemciler LiveKit'in giriş ve çıkış olaylarını görür. Kimlik LiveKit'te sunucu tarafından doğrulanmıştır. İstemci önce gürültü kurallarını uygular, sonra sesi erişim servisinden indirir ve bellekte tutar. Bu indirme kanal üyeliği ve bağlanma izni ister. Ses seçili hoparlörden yerel olarak çalar.
4. Kişi odadayken sesini değiştirirse erişim servisi aktif bağlantısındaki özelliği günceller.

Eski istemciler bilmedikleri özelliği yok sayar ve klasik sesi çalar.

## Sesler ve sınırlar

- **ROOMS sesleri:** Fanfar, Kapı zili, Arcade, Portal, Damla, Kristal, Kapanış ve Hoşça kal. Hepsi kodda sentezlenen özgün seslerdir; kayıt veya lisanslı içerik kullanılmaz.
- **Yükleme:** şimdilik yalnızca masaüstünde. Dosya (MP3, WAV, OGG, FLAC; M4A cihazdaki çözücüye bağlı) en fazla 20 MB ve 5 dakika olabilir ve cihazda çözülür. Kesit seçilirken bellekte yalnızca tek kanallı bir kopya tutulur. Kişi en fazla 4 saniyelik bir kesit seçer ve önizler. Sunucuya yalnızca bu kesit mono 48 kHz WAV olarak gider. Kişi başına en fazla 6 ses saklanır.
- **Ses düzeyi:** sunucu her yüklemeyi kendisi ölçer (ITU-R BS.1770). Sesi −20 LUFS'e getirir; en fazla +12 dB yükseltir, tepeyi −3 dBFS'nin altında tutar, baştaki ve sondaki sessizliği kırpar, kenarları 5 ms ve 30 ms ile yumuşatır. Neredeyse sessiz kesitler reddedilir. İstemcinin ses düzeyine güvenilmez. Ham dosya saklanmaz.
- **Hak beyanı:** yüklerken kişi sesi kullanma hakkı olduğunu onaylar. Telifli müzik, başkasının sesi veya rahatsız edici içerik yüklenmemelidir. Kısa olması bir kaydı telif sorunundan kurtarmaz.

## Dinleyici ayarları

- **Oda giriş ve çıkış sesleri:** mevcut ana anahtar. Kapalıyken hiçbir ses çalmaz.
- **Kişisel giriş sesleri:** varsayılan olarak açık. Kapalıyken herkes için klasik ses çalar.
- **Efekt ses düzeyi:** klasik ve kişisel seslerin bu cihazdaki düzeyi.
- **Giriş sesini sustur:** odada bir kişiye sağ tıklayınca (iPhone'da kişi ayarlarında) çıkar. Yalnızca o kişinin kişisel sesini, yalnızca senin cihazında susturur.

## Gürültü kuralları

Her dinleyici aynı kuralları uygular; kurallar `packages/shared-contracts/src/personal-sound-policy.ts` dosyasındadır ve iPhone'da birebir aynıdır.

- Sen odaya girerken veya bağlantın yenilenirken içeridekiler için ses çalmaz. Bağlantının yenilenmesi geçmişi silmez: bekleyen çıkışlar ve bekleme süreleri korunur.
- Çıkış sesi 1,5 saniye bekler. Kişi bu sürede geri gelirse (yeniden bağlanma) iki ses de çalmaz. Bu bekleme sırasında kişinin sesi indirilir.
- 30 saniye içinde geri dönen veya 10 saniyeden kısa kalan kişi için klasik ses çalar.
- Aynı kişinin aynı olay için kişisel sesi en fazla 2 dakikada bir çalar.
- Oda genelinde 5 saniyede en fazla bir kişisel ses çalar. Bir kişisel ses hâlâ çalıyorsa yenisi başlamaz, yerine klasik ses çalar. 400 ms içindeki klasik sesler tek ses olur.
- 1,5 saniyede hazır olmayan kişisel ses atılır; yerine klasik ses çalar. Geç çalma veya kuyruk yoktur.
- Odadan atılınca veya bağlantı tamamen kopunca bekleyen sesler iptal olur.
- Çıkış seslerinin anında çalabilmesi için odadakilerin sesleri önceden indirilir; bu en fazla 16 sesle sınırlıdır ve aynı liste tekrar indirilmez.

## Depolama, gizlilik ve moderasyon

- Sesler erişim servisinde `/state/personal-sounds/<kullanıcı-id>/` altında saklanır (`profile.json` ve `<uuid>.wav`). Herkese açık değildir. Bir yüklemeyi yalnızca o ses kanalına bağlanabilen doğrulanmış üyeler indirebilir; sesin sahibi de o kanalı görebiliyor olmalıdır. Yükleme, oturum doğrulanmadan okunmaz.
- Silinen ses hemen kaldırılır; atanmışsa o olay klasik sese döner.
- Sunucu ayarları ve yönetici işlemleri [sunucu rehberindedir](SELF_HOSTING.md): yüklemeyi kapatma, toplam alan sınırı ve bir kişinin seslerini silme.
- Hesap silindiğinde sesler şimdilik kendiliğinden temizlenmez; yönetici klasörü elle siler.
- Bu sürümde moderasyon dinleyicinin kendi susturmasıyla sınırlı. Topluluk sahibinin bir üyenin sesini kapatması sonraki sürümde.

## Doğrulama durumu

- **Birim ve HTTP testleri** bu sürümle gelir. Ses işleme, politika, erişim servisi rotaları, masaüstü çalma ve ayarlar, iPhone RoomsCore kapsanır.
- **Servis entegrasyonu (3. seviye):** `tests/e2e/specs/personal-sounds.spec.ts`, yerel yığında iki gerçek Electron istemcisiyle gerçek erişim servisi ve LiveKit v1.9.12'ye karşı çalışır. Doğrulananlar: Ayarlar'dan seçilen ses, LiveKit özelliği olarak diğer üyeye ulaşır ve o üye sahibin sesini çalar. Oda içindeyken yapılan değişiklik canlı uygulanır. Kişisel sesleri kapatan dinleyici klasik sesi duyar. Sesler Chromium'un sentetik çıkışına çalar; kulakla dinlenmez.
- **Henüz yapılmadı (4. seviye):** iki fiziksel masaüstü ve bir iPhone ile gerçek oda kabulü. Duyulabilirlik ve ses düzeyi, gerçek ağda yeniden bağlanma, ekran paylaşımı sürerken çalma, Windows'ta çalma, iPhone hoparlöründe yankı, Bluetooth ve kilitli ekran ayrıca denenmelidir. Bunlar doğrulanmadan çalıştığı söylenmemelidir.
