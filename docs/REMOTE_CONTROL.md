# Onaylı masaüstü kontrolü

Tayfa'da sunum devri ile işletim sistemi giriş onayı ayrıdır. İnsan izleyici gerçekten yayımlanan ekran izinin kontrolünü ister. Yayıncı o anda seçili tam monitör için yerel onay penceresinden kabul eder. Pencere yakalama, bot, Agent görevi, pano eşzamanlama, dosya aktarımı veya gözetimsiz erişim için giriş yolu yoktur.

Access her kısa ömürlü istek/onayı odaya, yayıncı/denetleyici kimliklerine ve LiveKit katılımcı SID'lerine, gerçek ekran izi SID'sine ve yeni yerel yakalama nesline bağlar. Yeniden katılma, yeni yakalama, iz/üyelik kaybı veya servis yeniden başlatması yeni karar ister. Beş saniyelik kirayı yalnız yayıncı kalp atışı uzatır. Yerel ana süreç 2,5 saniye içinde doğrulama ister; yavaş/eski yetki yanıtını reddeder. Yeniden bağlantı kullanılmış onayı etkinleştiremez.

32 bayt giriş anahtarı yalnız ilgili iki yerel istemciye verilir ve ana süreç belleğinde tutulur. Preload anahtarsız kesin görünüm sunar. Ana süreç yalnız isteyen denetleyicinin güncel kirası için imzalar; eski arayüz kuyruğu yeni kiraya imza attıramaz. Görünüm, hedeflenmiş LiveKit veri kanalında yalnız imzalı ve sınırlı paket taşır. Ana süreç yerel girişten önce HMAC, kaynak nesli, kira, bitiş, zaman damgası, sıra ve hızı doğrular. Fare hareketi ayrı kayıplı sıra, tuş/düğme güvenilir sıra kullanır. Diğer üyeler anahtar almaz. Veri yayını yalnız onay sonrası açılır, mikrofon/kamera/ekran izinlerini korur; normal/yeniden katılmış oda yetkisinde veri yayını kapalıdır.

Mac normal Erişilebilirlik/Giriş İzleme izinleriyle CoreGraphics ve olay dinleyicisi kullanır. Windows SendInput, alt düzey giriş kancası ve normal masaüstü/UIPI sınırını kullanır; yetki yükseltmez veya güvenli masaüstüne geçmez. Giriş yalnız gerçek güncel monitör geometrisiyle başlar. Electron `display_id` monitörü seçer; Windows DIP koordinatı fiziksel piksele çevrilip yerel sınırla kontrol edilir. Koordinat o monitörde kalır. Odaklı pencere seçili monitör dışındaysa tuşa basma reddedilir; önce görünür pencereye tıklayın. Bazı işletim sistemi kısayolları görünümden iletilemez.

Yayıncının yerel fare/klavye hareketi kontrolü bitirip tutulan tuş/düğmeleri bırakır. Yerel modül durma/hata/temizlemede de bırakır. Genel acil bırakma Control+Alt+Shift+K, Mac'te Control+Option+Shift+K'dir; kısayol ayrılamazsa etkinleşmez. İzleyici odağı kaybı, kaynak seçimi, oda/hesap değişimi, ağ/kalp atışı kaybı ve ekran geometrisi değişimi kontrolü iptal eder. Arayüz etkin denetleyiciyi ve bırakmayı gösterir. Yetkili ping/pong gerçek veri kanalı gidiş-dönüşünü ölçer; toplam video kodlama veya girdiden görüntüye gecikme iddiası değildir.

Bağımsız N-API modülünü Mac'te veya Windows Visual Studio x64 geliştirici kabuğunda `node scripts/prepare-remote-input.mjs` ile derleyin. İndirilen resmî Electron SDK girdileri SHA-256 ile sabittir. Yayın/paket yolları modül ve kaynağı içerir, kaynak/platform/mimari üstverisini doğrular. Derleme/yükleme kontrolü monitörü etkinleştirmez, kanca kurmaz, giriş göndermez; onaysız tuş çağrısı `false` dönmelidir.

## Kabul

Kaynak testleri yalnız insan onayını, yayıncı yetkisini, gizli anahtarları, kaynak/SID/iz/nesil değişimini, üyelik/yeniden katılma/süreyi, HMAC değiştirme/tekrarı, bağımsız kayıplı/güvenilir sırayı, eski arayüz kiralarını, yerel onay yarışını, edilgen süre dolmasını, aktarım gecikmesini ve ses izinlerini korumayı kapsar. Yerel örnek testler açıkça enjekte edilmiş örnektir; fiziksel işletim sistemi kontrolü değildir.

Üretim kabulü için iki fiziksel istemciyle Mac↔Mac ve Mac↔Windows'u iki yönde sınayın: açık reddet/onayla, yalnız tam monitör, çoklu monitör/negatif başlangıç/DPI, görünür odaklı pencereye yazı, sürükleme/kaydırma, değiştirici tuşları bırakma, yayıncının yerel devralması, acil kısayol, izleyici odak kaybı, ağ/yeniden katılma/üye iptali, kaynak durdur/değiştir ve güvenli masaüstü reddi. Ses/DJ/ekran birlikte çalışmasını sınayın. Gerçek gecikme, sonuç ve OS izin kurulumunu kaydedin. CI bu koşulu kapatmaz. Arkadaş testi yayını, katılımcıların tamamladığı üretim kabulü olarak gösterilmemelidir.

Geri dönüş istemci yeteneğini/yeni Access yollarını kaldırır, kısa ömürlü kiraları iptal eder. Ekran paylaşımı, müzik, hesap ve veriler bağımsızdır. Hatayı gizlemek için OS korumasını kapatmayın veya ekran iznini genişletmeyin.

Kaynaklar: [Electron Display](https://www.electronjs.org/docs/latest/api/structures/display), [ekran koordinat dönüşümü](https://www.electronjs.org/docs/latest/api/screen), [yakalama kaynağı ekran kimliği](https://www.electronjs.org/docs/latest/api/structures/desktop-capturer-source).
