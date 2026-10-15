# Kişisel IPTV oynatma motorları

Kullanıcı okunur kategori adlarının eksik olduğunu, oynatmanın kesildiğini, takıldığını ve hataların belirsiz kaldığını bildirdi. Aynı sorunlu kanal kullanıcının VLC denemesinde kesintisiz oynadı. Bu, incelemeyi ROOMS oynatma yoluna daraltır; belirli kodeği teşhis etmez veya sağlayıcıya giden istek farklarını dışlamaz. Özel sağlayıcı URL'si/hesabı verilmedi veya incelenmedi.

Kaynak düzeltmeleri standart, sarmalanmış ve anahtarlı Xtream kategori yanıtlarını kabul eder; ondalık kimlikleri kayıplı sayısal dönüşüm olmadan normalleştirir. Kategori üstverisi yoksa satırdaki ad kullanılır. Çözülemeyen ad açık belirtilir; iç numara okunur grup adı gibi sunulmaz. Canlı bekleme/takılma olayları sınırlı gözetim süresi kullanır; gerçek ilerleme, duraklatma veya hesap kapatmada iptal edilir, mevcut sınırlı HLS kurtarmasına bağlanır. Bilinmeyen hata artık hesap/kaynak geçersiz demek değildir. Bunlar bildirilen kanalın çalıştığını onaylamaz.

## Yerel motor yönü

ROOMS gezinme/kontrollerini koruyarak kişisel medya için libVLC yerel arka ucu değerlendirildi. Resmî gömme arayüzleri macOS NSView ve Windows HWND yüzeyi sağlar. HTML/HLS yolu zaten Chromium/hls.js ile çözer; sıfırdan yeni çözücü değildir. VLC desteklenen biçimleri genişletebilir; sağlayıcı hataları ve kategori üstverisi ayrıca ele alınır.

Görünümü sağlayıcı kimlik bilgileriyle doğrudan libVLC'ye bağlamayın. Yerel sağlayıcı yetkisini, hesap nesillerini, sınırlı ağ doğrulamasını, erişim iptalini ve yalnız yerel oynatmayı kullanın. VLC `rooms-provider:` bilmez; yetkili yerel akış bağdaştırıcısı bu yeteneği ve yeniden yazılmış liste/segment URL'lerini çevirmelidir. Özgün sağlayıcı bilgilerini açığa çıkarmamalı, rastgele dosya/ağ erişimi vermemelidir. Motor günlük/olaylarında kaynak URL ve yetki verisi bulunmamalıdır.

Benimsemeden önce sabit yerel bağ ve eşleşen ARM64/x64 libVLC değerlendirilmelidir. İncelenen electron-vlc-player, libVLC içermez ve kaydırmasız sabit kapsayıcı ister; yerel pencere/üst katman yaşam döngüsünün mevcut arayüze doğrudan uyduğu varsayılamaz. Her iki platformda boyut/tam ekran, kontroller, rota gizle/dön, durdur/hesap değiştir, çökme, ses/video izi ve uzun oynatmayı doğrulayın. Seçilen çalışma ortamı/eklentilerin lisans, bildirim ve gerekli kaynak/yeniden bağlama malzemelerini dağıtın; tüm VLC ikililerinin aynı lisans olduğunu varsaymayın.

## Yerel uygulama ve paketleme

Üçüncü taraf Electron sarmalayıcısı, yeniden derleme zinciri Git kaynaklı node-gyp istediği için pnpm'in alışılmadık alt bağımlılık politikasıyla reddedildi. Politika açık bırakıldı; sarmalayıcı ve kodu kurulmadı/kopyalanmadı/derlenmedi. ROOMS, VideoLAN'ın resmî libVLC 3 C API'sine yazılmış bağımsız küçük N-API bağdaştırıcısı kullanır; npm bağımlılığı eklemez.

`pnpm prepare:vlc`, sabit VLC 3.0.23 ve bağımlılık kaynak özetlerini doğrular, Mac motorunu kaynaktan derler, bağdaştırıcıyı derler, lisans/bildirimleri korur. Kaynak derlemesi FFmpeg 7.1.5, VideoLAN güvenlik yamalı libdvbpsi 1.3.3, libgcrypt 1.12.0/libgpg-error 1.58 ve FreeType 2.14.1 kullanır. Küçük avcodec sürüm koşulu düzeltmesi avformat olmadan derlemeyi destekler. Resmî Mac ikili dağıtımı derleyicinin ev yollarını içerdiğinden değiştirilmemiş gizlilik kontrolü tarafından reddedildi; yalnız özel yerel inceleme için tutuldu, paketlenmedi. Mac ARM64 ve Windows x64 kendi sunucu derleyicisini kullanır; Windows Visual Studio x64 geliştirici kabuğu ister. Resmî Electron SDK girdileri özetle sabittir. Üretilen çıktı Git dışındadır. `ROOMS_VLC=1` motoru pakete ekler; yoksa Chromium/HLS kalır. Kişisel oynatıcıda açık Standart seçimi korunur; otomatik eşzamanlı ikinci sağlayıcı akışı başlatılmaz.

Her oynatma mevcut hesaba bağlı sağlayıcı yeteneğiyle başlar. Yerel motor yalnız `127.0.0.1` adresine bağlı rastgele yetenekli sunucuyu görür. Ana süreç mevcut sağlayıcı ağ/yönlendirme/aralık doğrulamasından geçirir, HLS alt yollarını yazar, çözülmemiş listeleri ve desteklenmeyen kök referans kapsayıcılarını reddeder, yetki iptalinde okumayı keser. Sağlayıcı adresi/bilgisi, yerel yetenek URL'si ve pencere tanıtıcıları görünüme verilmez. Pencere sınırları kısıtlanır; eski React belirteci yeni oynatmayı yönetemez/durduramaz. Başlatma ve engelleyici libVLC stop/release eşzamansızdır. Kapsam sorgusu duraklatılmış oynatmayı da iptal eder. Yerel pencere kapanması oynatıcı yetkisini kaldırır.

Gezinme, EPG ve kontroller korunur. Video yalnız üstveri yüklenince değil libVLC görüntülenen kare bildirince görünür. Yerel çizim DOM kontrollerinin üstünde sınırlanır; görünmeyen fakat tıklanabilir düğme sorunu önlenir. Tam ekran Escape işleyicisi açıktır. libVLC, bağımsız VLC uygulamasının kullanıcı ayarını kullanmaz. Yerel yüzey rota değişimi, modal/menü, küçültme ve kapatmada gizlenir. libVLC güvenilir canlı sarma aralığı vermiyorsa DVR kapalıdır; aralık veren kaynak için kullanıcı Standart'ı seçebilir. Motor kişisel yerel oynatma içindir; sağlayıcı içeriğini yayınlama eklemez.

LGPL ortak motor ve kaynağı değiştirilebilir; eklentiler GPL veya başka lisanslı olabilir. Arşiv/kaynak bağlantıları, COPYING, COPYING.LIB, AUTHORS, THANKS ve resmî dağıtım bildirimleri ile ROOMS bağdaştırıcı kaynağı/derleme betiği eşlik eder. Yayından önce iki platform paketi, gerçek çıktı/kontroller/boyut/tam ekran, hesap/pencere iptali ve bildirilen uzun IPTV oynatımı doğrulanmalıdır. Sentetik/taklit kontroller gerçek sağlayıcı/fiziksel kabulü kapatmaz. İlk uygulama aday tutuldu; sonraki RC9 dağıtımı aşağıdadır. Güncel yayın [RC12](RC12_RELEASE.md)'dir.

Birincil kaynaklar: [VideoLAN kaynak/lisans](https://github.com/videolan/vlc), [resmî libVLC oynatıcı arayüzleri](https://videolan.videolan.me/vlc-3.0/group__libvlc__media__player.html), [incelenen Electron bağının gereksinimleri](https://github.com/ssnangua/electron-vlc-player).

## Doğrulama geçmişi

Kaynaktan Mac motoru değiştirilmemiş özel değer kontrolünü ve en düşük Mac sürümü denetimini geçti; tüm yerel kütüphaneler 14.0 destekler. Gerçek imzasız Mac uygulaması, ayrı yerel kaynaklarıyla açık paket kontrolünü geçti. Bu imza/noter veya Windows kabulü değildi.

Gerçek sentetik AVI/PCM, çözülmüş/görüntülenmiş kare ve ses çıktı tamponu üretti. Duraklat/devam, sınır API'si ve eşzamansız durdurma geçti. Yalıtılmış sentetik hesap/kaynakla gerçek PersonalPlaybackRuntime arayüzü ilk kare sonrası kontrolleri, duraklat/ses/seçenekleri, rota gizle/dön, tam ekran/Escape ve 900×700 taşma kontrolünü geçti. Yerel pencere görsel olarak incelendi; bulunan kontrol örtüşmesi düzeltilip tekrar çekildi. Kanıtlar özel üretilmiş test kayıtlarıdır. Gerçek sağlayıcı kanalı, uzun IPTV, imzalı soğuk açılış ve fiziksel Windows/iki istemci kabulü ayrı kaldı. Aday kontrolleri yayın yapmadı veya sahibin kurulumunu değiştirmedi.

Karşılık gelen kaynak arşivi altı özetle doğrulanmış üst arşiv ile bağdaştırıcı, derleme betikleri ve yamadan üretildi. Son sürüm için yeniden üretilip kurulum yanında dağıtılmalıdır. Tam kaynak paketi 130 dosya/855 test, ardından iki başlatma/hesap iptali yarış regresyonunu geçti. Lint, tür ve servis derlemesi başarılıydı. O sırada platform CI bekliyordu; sonra iki paket kaynak işi de geçti.

Ek aktarım regresyonu: üretilen H.264/AAC MPEG-TS başlangıçta çıktı vermedi; TS eklentisi bağdaştırıcı rpath üzerinden gömülü libdvbpsi'yi çözemiyordu. Eklenti/kütüphane yolları yükleyen ikiliye göre çözülecek şekilde düzeltildi. Aynı akış video/ses üretti, duraklat/devam/durdur geçti. Ham AVI'den ayrı kontroldür ve gerçek sağlayıcı kabulü değildir. Yerel deneme görünür yalıtılmış pencere kullanır; gizli pencerede kare çizimi aralıklıydı. Linux birim örnekleri desteklenen masaüstü platformunu açık taklit eder, üretim Linux oynatma açmaz.

Aktarım düzeltmesi sonrası RC9: tam paket 130 dosya/859 test geçti. Yerel sentetik HLS/H.264/AAC görüntülenen kare, ses tamponu ve altı saniyelik sarılabilir zaman çizgisiyle geçti. O aşamada RC9 aday, RC8 kurulu/canlıydı.

Barındırılan Mac CI 151 çözülmüş kare ve ses tamponu, sıfır kompozitör görüntü karesi üretti. Açık `ROOMS_VLC_QA_OUTPUT=decode` kontrolü çözme/ses/API yaşam döngüsünü onaylar; kompozitörü kapsam dışı kaydeder. Varsayılan yerel kontrol görüntülenen kare ister. Bu ayrım gerçek görünür oynatıcı kontrolünü kaldırmaz. İmzalı RC9 boş ayrı profilde sentetik HLS video/sesi geçti; ilk görüntü 2761 ms. Apple noter onayı, damgalama ve Gatekeeper başarılıydı. Gerçek sağlayıcı veya genel yayın kabulü çıkarılamaz. Değişmez aday kaynak `8f95ac1` idi.

## RC9 arkadaş testi dağıtımı

Sahibi, sonraki gerçek kanal kabulünden önce RC9'u yayımlayıp arkadaş güncellemelerini açmayı açıkça onayladı. [RC9 Mac paketleri ve kaynakları](https://github.com/egemenmermer/rooms/releases/tag/v0.1.18-rc.9) yayımlandı. İmzalı/damgalı uygulama/arşiv noter, Gatekeeper, açık kaynak denetimi ve RC8 güncelleme açık anahtarına göre Ed25519 doğrulamasını geçti. O tarihte besleme/indirme sayfası Mac RC9 sundu; eski arşivler ve Windows RC8 korundu. Sahibin kurulumu değiştirilmedi.

Masaüstü kaynak `8f95ac1`; sonraki yalnız arka uç `8f9a502` düzeltmesi DJ arama HTTP sözleşmesini düzeltti, masaüstü girdilerini değiştirmedi. Tam paket 131 dosya/861 test ve tüm barındırılan kontroller geçti. Sınırlı şifreli yedek ve etkin oda yokluğu sonrası Access/müzik güncellendi. Gerçek sağlık, beş sonuçlu arama ve geçmiş HTTP kontrolleri geçti. Yeni geçmiş dizini özel/kalıcıdır, DJ hesap yetkisinden ayrıdır. Topluluk görselleri sunucuda, kaynak/paket dışında kaldı. Hesap, Hoppers ve sosyal veritabanı değiştirilmedi.

Bildirilen uzun sağlayıcı oynatımı, gerçek hesap sohbet/fotoğraf/kuyruk geçmişi, fiziksel Windows ve iki istemci medya kabulü açık kaldı. Arkadaş testi yayını bu koşulları onaylamaz. İlk Mac dağıtımında Windows yerel derleme/kaynak kontrolü geçti fakat indirme RC8 idi; ayrıca onaylanan Windows RC9 aşağıdadır.

## Windows RC9 eklenmesi

Sahibi mevcut RC9'a Windows x64 eklemeyi onayladı. `6bb398f72e343b19d5a63e7566688a7370fe5573`, [38608454039 çalışmasında](https://github.com/egemenmermer/rooms/actions/runs/38608454039) gerçek Windows kurulum işini geçti. `ROOMS-0.1.18-rc.9-windows-x64-setup.exe`: 192410868 bayt; SHA-256 `99cec572636e91ed24f7405c3507c4ebdbda32f44a59deb4f29e30a6a6656506`. İmzasız arkadaş önizlemesidir; güvenilir imzalı Windows yayını değildir. Mac arşivi/besleme özgün baytları korunur.

Gerçek çalıştırma eksik Windows gecikmeli yükleme kancasını buldu: Node simgeleri ayrı Node'dan değil yükleyen Electron/ROOMS'tan çözülmelidir. Derlemeye kanca eklendi. Kütüphane/eklenti yolları Unicode Windows API'si kullanır; Türkçe karakterli dizine kurulum doğrulandı.

Windows Server 2025 işi NSIS'i sessiz kurdu, kurulu/paket ASAR özetlerini karşılaştırdı, kurulu VLC'den gerçek sentetik video gösterdi; duraklat/devam, sınır, iptal ve eşzamansız durdurmayı sınadı. Arayüz menü/Escape, tam ekran/Escape, rota gizle/dön ve 900×700 taşmayı geçti. Kurulu korumalı uygulama kimlik bilgisi göndermeden giriş/kayıt gezinmesi, geçersiz ayrıcalıklı komut reddi, 900×700/1440×900 ayarlar, Strong/Standard WASM hazırlığı ve normal açılış kalıcılığını geçti. Ekran kaynakları listelendi; yakalama/yayın yapılmadı.

Barındırılan Windows'ta ses aygıtı yoktur. Yalnız Windows CI için açık ses istisnası sonuçta kayıtlıdır; yerel video gösterimi hâlâ zorunludur. Varsayılan yerel doğrulama ses tamponu ister. Fiziksel Windows sesi/mikrofon/kamera/ekran paylaşımı, uzun özel IPTV ve gerçek iki istemci kabulü açıktır. Güvenlik uyarısı aşma, canlı giriş veya sağlayıcı oynatma yapılmadı. Windows güncellemeleri elle kurulumdur. Tam doğrulama kayıtları ve kaynak/lisans malzemeleri arkadaş paketine eşlik eder; güncel indirmeler için yayın envanteri esas alınır.
