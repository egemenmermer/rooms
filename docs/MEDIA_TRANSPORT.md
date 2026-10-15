# Gerçek zamanlı medya aktarımı

Bu belge ilk aktarım uygulamasını ve 8 Ekim 2026 doğrulamasını kaydeder. Sonraki ekran sesi ve masaüstü davranışları [hata/özellik tesliminde](BUGS_FEATURES_DELIVERY.md), güncel yayın [RC12 notlarında](RC12_RELEASE.md) anlatılır.

## Uygulama

`LiveKitMediaProvider`, değiştirilebilir `RealtimeMediaProvider` sözleşmesini sabitlenmiş `livekit-client` 2.22.3 ile uygular. `liveKitMediaProvider`, rota bileşenleri dışında, görünümün gerçek zamanlı deposuna ait tek örnektir. Gezinme ses oturumunu yok etmez.

Ayrıcalıklı erişim aracısı hesap ve kanal üyeliğini doğrulayıp geçici `{ roomId, url, token }` yetkisi döndürür. İlk bağdaştırıcı Spacebar hesabını kullanıyordu; güncel sosyal bağdaştırıcı [mimaride](ARCHITECTURE.md) açıklanan Stoat'tır. Belirteç yalnızca bellekte tutulur; bağdaştırıcı LiveKit servis imza sırrını almaz. Uzak sunucular WSS gerektirir; güvensiz WS yalnızca yerel geliştirmede kabul edilir. Belirteç içeren URL reddedilir.

Bağlanma sinyalleşme ve otomatik aboneliği kurar; mikrofon, kamera veya ekran yakalamayı başlatmaz. Aygıtlar açık kullanıcı eylemiyle yayımlanır. Mikrofon yankı giderme ve gürültü bastırma ister. Kamera 640×360/24 fps, ekran uyarlanabilir dağıtımla 1280×720/30 fps başlar. İlk uygulamada ekran sesi, platform kabulü beklenerek kapalıydı; sonraki sürümlerde bağımsız ekran sesi kontrolleri eklendi, fiziksel kabul ayrıca izleniyor. Yerel kaynak seçimini Electron ana süreci yönetir; bağdaştırıcı SDK'nin tarayıcı ekran yakalama isteğini çağırır.

Uzak ses yönetilen gizli ses öğelerine bağlanır. Sağırlaştırma bu öğeleri gerçekten susturur ve mikrofonu kapatır; sağırlaştırmayı kaldırmak duymayı geri getirir, mikrofonu otomatik açmaz. Kişisel ses düzeyi %0–100'dür. Arayüz, `attachTrack` ile video öğelerine sahip olur; temizleme arayüz DOM'unu silmeden bağlantıyı ayırır. Ayrılma yerel izleri durdurur, yönetilen ses öğelerini/olay işleyicilerini kaldırır, tanı ve sırları temizler, eski odayı kapatır. SDK tamamlanmadan başarılı bağlantı bildirilmez; geçici yeniden bağlanma durumları gösterilir. Tam yeniden bağlantı yeni yetkili aracı izni gerektirir; süresi dolmuş bilgiler sessizce kullanılmaz.

## Yetki sınırı

İstemci yakalama istemeden önce gördüğü başka sunucuyu reddeder. Bu bir kullanım kontrolüdür; yarış durumuna dayanıklı yetki garantisi değildir. Aracı sunum sahipliğini ayırmalı ve LiveKit yayın kaynak izinlerini buna göre vermelidir. Varsayılan mikrofon/kamera, yalnızca ayrılmış sunucuya `screen_share` verin. Durdurma/ayrılma/ev sahibi devrinde sunum iznini geri alın. Yalnızca istemci kontrolü tek sunumcu kabulünü tamamlamaz.

Aktarım WebRTC DTLS-SRTP ile yolda şifrelenir. Uçtan uca şifreleme yapılandırılmamıştır; varmış gibi belirtilmemelidir.

## Tanı

Bağdaştırıcı beş saniyede bir güncel izlerin RTC raporlarını okur, rapor kimliklerini tekilleştirir. Alınan bit hızı (bayt sayacı farkından bit/saniye), birikmiş alınan paket kaybı oranı ve seçilen aday çiftinin gidiş-dönüş gecikmesi (ms) bildirilir. Eksik ölçümler uydurma varsayılanlarla doldurulmaz; `null` kalır. Bu alınan medya toplamıdır; toplam ağ çıkış faturası değildir.

## Doğrulama

- `pnpm exec vitest run --root . tests/media-provider.test.ts`: 8 Ekim 2026'da 9 test başarılı. URL, açık yakalama yaşam döngüsü, mikrofon sağırlaştırma, yakalama reddi, sır sızdırmayan hata, rakip sunucu ön kontrolü, yeniden bağlanma, mevcut/sonraki uzak seslerde sağırlaştırma ve başarısız yeniden bağlanmada yakalamanın hemen durması kapsandı.
- Bu testler SDK taklitleri kullanır; iki gerçek istemcili aktarım doğrulaması değildir.
- İlk tam tür kontrolünde yalnızca Activities.tsx içindeki önceden var olan `Youtube` ikon dışa aktarım hatası bulundu; medya sağlayıcısı tür hatası yoktu.
- Fiziksel mikrofon/kamera, macOS ekran izni/seçici, uzak sesin duyulması, Windows yakalama/sistem sesi ve iki fiziksel bilgisayar çalışma zamanı kabulü gerektirir.
- `node scripts/livekit-verify.mjs`, 8 Ekim'deki ilk denemede engellendi: iki gerçek Electron görünümü açıldı fakat `127.0.0.1:7880` bağlantıyı reddetti. SDK bağlanmadı; alınan medya sonucu yoktu. Araç yok sayılan `infra/local/.env` dosyasını kimlik bilgilerini yazmadan okur, ayrı kısa ömürlü kimlikler üretir. Gerçek sunucuda sentetik ses/video RTP alımı, uzak yayın susturma/açma ve ekran yayınını kaldırmayı sınar. Sentetik medya aygıt/seçici değil aktarımı doğrular.

### Yerel alternatif ve gerçek aktarım sonucu

Yerel sanal makine çalışma ortamı takıldığı için Docker kullanılamadı. [Resmî yerel kurulum](https://docs.livekit.io/transport/self-hosting/local/) izlenerek `HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 brew install livekit` ile macOS ARM64'e LiveKit Server 1.13.9 kuruldu. İlgisiz Homebrew onarımı veya genel Docker yeniden başlatması yapılmadı.

`node scripts/livekit-native.mjs`, üretilen yerel anahtarlarla resmî sunucuyu başlatır; sinyalleşme `127.0.0.1` adresine bağlıdır. Yerel geliştirme alternatifidir, uzak dağıtım değildir. Ctrl+C ile durur. `infra/local/livekit.yaml` üzerinden 0600 izinli, Git'in yok saydığı geçici yerel yapılandırma üretir ve çıkışta siler.

Ardından `node scripts/livekit-verify.mjs`, 8 Ekim'de gerçek sunucuda başarılı oldu: ayrı iki Electron görünümü kısa ömürlü kimliklerle katıldı; sentetik ses ve tuval video RTP paketleri alıcıya ulaştı; alıcı gerçek mikrofon yayınını susturma/açma ve ekran yayınının kaldırılmasını gördü. İlk bağlantı engeli yerel sunucuyla çözüldü.

Bu sonuç gerçek SDK, sinyalleşme ve medya ile WebRTC aktarımını doğrular. Fiziksel mikrofon duyulabilirliği, kamera izni, yerel ekran/pencere seçimi, sistem sesi veya iki fiziksel bilgisayarı doğrulamaz; bunlar uygulanmış fakat doğrulanmamış kabul durumlarıdır.

Sonraki denemede gerçek sinyal kesintisi de başarılı oldu: LiveKit `signal-reconnect` senaryosu gerçek bağlantıyı kapattı, bağdaştırıcı `reconnecting` sonra `connected` gördü ve alınan RTP sayısı artmayı sürdürdü. Bu gerçek soket yeniden bağlantısıdır; işletim sistemi/ağ kesintisi veya SFU yeniden başlatma testinin yerine geçmez.
