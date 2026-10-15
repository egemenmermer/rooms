# Sunucu yönetimi teslim kaydı

Sahibin onayladığı sıra: izleme → kalıcı işletmeci terminalleri → insan/Agent işbirliği → onaylı uzaktan masaüstü kontrolü. Her aşamanın kabul ve yayın koşulları ayrıdır. Kaynak/CI kontrolleri fiziksel cihaz kabulü anlamına gelmez.

İlk dağıtım mevcut fiziksel Core sunucusunu paylaşır. Yeni rootless çalışan için eski yalnız ayrı sunucu varsayımının yerini alır; mevcut ayrı Docker çalışanı seçenek olarak korunur. Agent Core kimlik bilgisi, Core ağı üyeliği, sunucu/root kabuğu, Docker soketi veya kişisel sağlayıcı kasası alamaz. Aynı makinedeki mantıksal ayrım fiziksel yalıtım değildir. Sunucu kayıt kimlikleri daha sonra taşımayı mümkün kılar.

Erişim, sahip ve açıkça verilen sunucuya özel izleme/terminal/Agent yetkileridir. Topluluk üyeliği ve Agent `canManage` sunucu izni değildir. İnsan sunucu terminali ile Agent çalışma alanı terminali ayrıdır; yalnız ikincisi AI'ye devredilebilir. Oturum başına tek yazıcı vardır. Yetki iptali, hesap ve kaynak değişimi eski eşzamansız sonuçları geçersiz kılar.

Varsayılanlar: 5 saniyede örnek; ham 24 saat/dakikalık 7 gün/saatlik 30 gün. CPU uyarısı %85/60 saniye, boş disk %15, yedek yaşı 24 saat, sağlıksız servisler. Sensör yoksa ölçüm kullanılamaz. İşletmeci başına 3 terminal, ayrılmış ömür 24 saat, kalıcı metin olmadan 1 MiB geçmiş. Agent tek etkin iş, 0,5 CPU, çalışan 512 MiB/toplam 768 MiB, 128 süreç, 2 GiB alan, 15 dakika. Başlatma CPU ≤%70/60 saniye, kullanılabilir RAM ≥1 GiB, disk ≥6 GiB ister. CPU >%90/30 saniye veya RAM <512 MiB yürütmeyi keser; belirsiz dış işlem tekrarlanmaz.

Uzaktan kontrol yalnız insanlar ve seçili tam monitör içindir; Mac/Windows desteklenir. Yayıncı her oturumu onaylar; paylaşım/kimlik/üyelik/ağ kaybı bitirir. Yeniden bağlantıda otomatik yetki yoktur. Pano, dosya aktarımı, gözetimsiz erişim veya AI masaüstü kontrolü yoktur. OS izin/yükseltme sınırları aşılmaz. Acil bırakma Ctrl+Alt+Shift+K, Mac'te Control+Option+Shift+K.

## Başlangıç kaydı

Çalışma main `8946b2f` üzerinden başladı. Mevcut Agent görev/onay/kontrol noktası API'si ve geçici yalıtılmış Docker komutları vardı; sunucu ölçümü, kalıcı PTY veya yerel uzak giriş yoktu. Ortak sunucu açık rootless çalışan ve ayrı Linux kimliği gerektiriyordu; mevcut korumaları kaldırmak çözüm değildi. O andaki Core 2 mantıksal CPU/~4 GiB RAM'di; tek yük ortalaması kapasite onayı değildir.

Koşullar: yalıtılmış davranış/güvenlik testleri, gerçek ölçüm/PTY/rootless çalışma, yetki iptali/yeniden başlatma, fiziksel katılımcılı Mac/Windows kontrolü, ölçülmüş ses/DJ birlikte çalışma, onaylı aşama dağıtımı ve geri dönüş. Hesap verisi, Hoppers ve eski yayın arşivleri korunmalıdır. Aşağıdaki tarihe bağlı aşamalar tek başına yayın/kabul iddiası değildir.

## 15 Ekim 2026 — aşama 1 ve 2

İsteğe bağlı HostOps, kesin ortak şemalar ve yerel Electron geçidi; sahip/delege izleme/terminal/Agent yetkileri; Linux CPU/bellek/disk/ağ ölçümü, sınırlı SQLite geçmişi ve tekilleştirilmiş uyarılar; Ayarlar → Sunucu; ayrı tmux servisi ve yalnız sunucu node-pty kitiyle devam eden insan terminali eklendi. AI sunucu kabuğu yoktur. Bu noktada üretim yolu, işletmeci kimliği veya istemci yayını açılmadı.

Kaydedilen sorunlar ve düzeltmeler:

- OPS-001: ölçüm yoktu. Gerçek Linux ölçümü eklendi; eksik sensör/medya `null`. CPU başlangıcı ve ağ sayacı sıfırlanması sınandı.
- OPS-002: kalıcı terminal yoktu. Sahip/oturum paylaşımı, tek yazıcı, artan girdi sırası, 3 oturum/24 saat ve özel yardımcı profil eklendi. Ayrı işletmeci aynı Linux profilini kullanamaz.
- OPS-003: SQLite uyarı sırası geçersiz JSON yolu kullanıyordu. Düzeltildi; kullanıcı onayı ayrımı, tekilleştirme ve saklama sınandı.
- OPS-004: geç WebSocket kapatma, aracı kapandıktan sonra yazabiliyordu. Tekrarlanabilir güvenli kapanış sınırı eklendi; tam test temiz bitişi denetler.
- OPS-005: bir paylaşılan oturumu iptal etmek diğerlerini ayırıyordu. İptal seçili oturuma daraltıldı; işletmeci/profil değişimi sahip olduğu oturumları bitirip eski paylaşımları temizler.
- OPS-006: akış yanıtı hesap değişimini aşabiliyordu. Yerel gövde tamamlama ve görünüm kimlik/sunucu nesilleri eski sonucu engeller; hesap değişimi sınandı.

Kanıtlar özel `.local/qa/hostops/` altında. Linux kontrolü yetkisiz, ağsız, salt okunur, CPU/RAM/PID sınırlı Node konteynerinde gerçek 2 çekirdek ölçümü ve SQLite'ı geçti; sıcaklık doğru biçimde desteksizdi. Ayrı geçici yetkisiz systemd/tmux servisi özel soketten işaret üretti, durdurulup temizlendi. Bu tam node-pty/aracı/arayüz yeniden başlatma kabulü değildi. İşaretli, gerçek hesaptan yalıtılmış Electron örneği 1440×900/900×700, klavye ve işletmeci açıklama kontrollerini geçti.

O aşamada açık kalanlar: Linux yerel kit/root profilleri/birimleri; PTY Unicode/Ctrl+C/boyut/aracı yeniden başlatma; özel vekil; gerçek ses/DJ sırasında ölçüm maliyeti; Sunucu görünümü dışı uyarı teslimi. Gerçek sınırlı kaynak sağlanana kadar medya bit hızı/RTT/kayıp/jitter ve servis hata oranı kullanılamaz. Altı kişi/iki saat fiziksel kabul iddiası yoktur.

O kontrol noktasında aşama 3–4 uygulanmamıştı: ortak rootless/toplam kota/başlatma, insan–AI devralma/kontrol noktası, sunucu taşıma ve onaylı Mac/Windows girişi. `agentAvailable:false` korunuyordu; izleme/terminal testleri bunları tamamlamaz.

`pnpm verify:ci`: lint, kesin TypeScript, 135 dosya/875 test, masaüstü/bildirim ve servis derlemeleri başarılı. Son terminal sıkılaştırması 14 odaklı test, tür/lint/servis derlemesini geçti. İmza/kurulum/besleme/etiket/yayın değişmedi.

- OPS-007: aynı hesabın iki penceresi kullanıcı düzeyinde tek yazıcı altında girdi verebiliyordu. Yazma bağlantıya bağlandı; salt okunurluk bağlantı bazında gösterilir. Geç eylemler sunucu/panel/hesap değişiminde engellenir.
- Gerçek Linux CI işi sabit node-pty kitini dar derleme onayıyla kurup root yardımcı/yetkisiz tmux zincirinde Unicode, boyut, Ctrl+C, ayırma, aracı yeniden oluşturma, tek artan sayaç ve sonlandırmayı sınar. Üretim profil/bilgisi kullanmaz; sonucu geçmeden kabul sayılmaz.
- OPS-008: gerçek PTY CI, tmux durum satırı yüzünden boyut farkı buldu. Masaüstü zaten durumu gösterdiğinden iç durum çubuğu kapatıldı. Gerçek 33×91 beklentisi gevşetilmedi.

## 15 Ekim 2026 — ortak sunucu ve uzaktan giriş

- OPS-009: Agent ayrı Docker sunucusu istiyordu. Açık isteğe bağlı rootless Podman eklendi; varsayılan ayrı sunucu koruması korundu. Başlangıç cgroups v2, root sahipli toplam sınır, ayrı UID ve özel sınırlı kalıcı alanı denetler. Yalnız ağsız göreve özel komut kabul edilir; rastgele bağ, model evi, ağ bayrağı reddedilir.
- OPS-010: kapasite/yoğunluk koruması yoktu. Kesintisiz gerçek 60 saniye CPU, bellek/disk rezervi, 15 dakika ve baskıda kesme eklendi. Ölçüm boşluğu/bilinmeyen değer reddedilir; belirsiz değişiklik tekrarlanmaz.

Odaklı başlangıç/bağ sınırı ve Agent testleri 17 test geçti. Gerçek rootless doğrulama ayrı geçici Linux CI olarak eklendi: kimlik/ağ/dosya, gerçek cgroup, kalıcı dosya, iptal ve zorunlu ENOSPC. Bu ve ortak terminal/yetki tamamlanmadan üretim Agent açılmaz. Bu aşama kaynak çalışmasıydı.

- OPS-011: CI rootless kurulumu çalıştırıcının özel HOME/runtime/cwd'sini devralıyordu. Temiz ortam ve erişilebilir çalışma dizini verildi; üretim de sağlayıcı/depo sırları ve otomatik vekil aktarımı olmayan ortam kurar. Dizin izni veya OS yalıtımı gevşetilmedi.
- OPS-012: insan devralması model API/araç yazmasıyla çakışabilirdi. Görev çapında durma onayı, yalıtılmış kalıcı rootless kabuk, tek yazıcı ve devamdan önce kapatma eklendi; belirsiz işlem doğrulaması kaldı. Dosyalar ortak, süreç bağlamı ayrı; ayrıcalıklı sunucu terminali kullanılmaz. HTTP/WebSocket sahipliği ve canlı iptal regresyonları var.
- OPS-013: Agent yetkisi sunucu işletmecisinden bağımsızdı. Özel üyelik denetimli HostOps köprüsü, ortak kip başlangıç koşulları ve görev/ayrılmış kabuk iptali eklendi. Görünüm yetki anahtarı/bot belirteci almaz.

Bu ara noktada aşama 3 kaynak/terminal/arayüzü vardı, gerçek Linux/PTY/arayüz/dağıtım bekliyordu; aşama 4 ve sunucu taşıma uygulanmamıştı. `agentAvailable:false` korunuyordu.

OPS-014 uygulamadan önce kaydedildi: ekran paylaşımında sunum devri vardı fakat onaylı OS girişi yoktu. Kaynak/iz/katılımcı bazında onay, yerel izin/giriş ve acil iptal gerekir; sunum isteği kontrol onayı sayılamaz. Gerçek Mac/Windows kontrolleri olmadan yerel giriş kabul edilmiş sayılamaz.

Aşama 3 gerçek kanıtı: Verify 38738821243, baseline, Mac yerel kontrol, sunucu PTY ve rootless işi geçti. Gerçek test kimlik/ağ/salt okunurluk, konteyner/üst kota, ENOSPC, iptal, kalıcı PTY Unicode/33×91/Ctrl+C, aracı yeniden oluşturma/tekrar etmeme ve yetki iptalini kapsadı. Yalıtılmış CI'dır; canlı Core birlikte çalışma/fiziksel kabul değildir. Kaynak `d6720c4` gönderildi; dağıtım/yayın yapılmadı.

Aşama 4: kısa ömürlü kaynak/katılımcıya bağlı insan onayı, özel yerel giriş geçidi, Mac CoreGraphics/Windows SendInput, yerel/acil bırakma, hedefli imzalı paket, ayrı güvenilir/kayıplı sıra, görev/kaynak/hesap sınırı, yerel onay ve izleyici kontrolleri eklendi. İmzalı ping/pong veri kanalı RTT ölçer; fiziksel gecikme sonucu değildir. Ayrıntı [uzaktan kontrolde](REMOTE_CONTROL.md).

- OPS-015: kısmi LiveKit izin değişimi ilgisiz bayrakları temizleyebilirdi. Kontrol güncellemeleri tüm güncel ses/video/kaynak izinlerini yeniden çıkarır; mikrofon/dinleme/ekran ve yeniden katılımda veri iptali sınanır. Normal medya belirteci veri yayını vermez.
- OPS-016: geç arayüz girdisi yeni kirayı hedefleyebilirdi. Ana imza özgün kira kimliği ister; yayıncı onayı yerel, iletişim/kaynak/hesap nesilleri eski sonucu engeller. Örnek test gerçek masaüstünü yönetmez.

Mac yerel derleme/yükleme/onaysız giriş reddi geçti. O noktada Windows, son CI/arayüz ve fiziksel onay/giriş/birlikte çalışma bekliyordu; sunucu/kurulum/besleme/yayın yoktu.

- OPS-017: görevde kaynak tavanı vardı, gerçek kullanım yoktu. Cgroup/birim ölçümü, toplam kapsam, eksik veri ve zaman eklendi. Dedicated Agent kullanıcı cgroup CPU'su sunucu çekirdeklerine göre normalleştirilir; bellek/PID ve sınırlı alan kullanımı 5 saniyede okunur. Başlangıç/sıfırlama/eski/eksik değer dürüst gösterilir; geç rapor etkin görev/denetleyiciye bağlıdır. Birim ve gerçek rootless CI ölçümleri vardır.
- OPS-018: gerçek Windows CI'da yardımcı `boolean` adı RPC SDK typedef'iyle çakıştı. N-API yardımcısı yeniden adlandırıldı; derleme/yükleme kontrolü korundu. Etkin kira sırasında güvenli masaüstü dahil OS izni tekrar denetlenir; yükseltme/izin aşma yoktur.
- OPS-019: tekrarlı üst REST yetkisi dar okuma sınırını tüketiyor, statik Agent oda listesi özel kanal izni iptalini görmüyordu. HostOps mevcut yalnız find okuyucusunu kullanır; veritabanı bilgisi Agent dışında kalır. Ortak yetki bunu zorunlu tutar, istenen odaları güncel kanal görünürlüğüyle kesiştirir. Reddedilmiş/eksik/bozuk üyelik/kanal bağlamı güvenli reddedilir. Agent'a yeni bot/Core bilgisi verilmedi. Odaklı iptal/topluluk testleri ve tür/lint geçti.
- OPS-020: hazırlanan sunucuda node-pty erişilemez çağıran cwd'sini devralıp yardımcı bağlanmadan `chdir(2) failed` verdi. Yerel başlatıcı açık `/` kullanır; yardımcı yine yalnız sabit yetkisiz profil dizinini seçer. Özel dizin izni genişletilmedi.
- OPS-021: ağsız ortak arka uç CLI model kurulumu sunup yanıltıcı giriş istiyordu. API-only yetenek açık gösterilir, desteksiz CLI kurulumu kapalı ve sunucuda reddedilir; ayrı arka uç sağlayıcıları korunur.

## RC10 yayın öncesi kabul noktası

Dört onaylı aşamanın kaynağı mevcuttu; yukarıdaki uygulanmamış ifadeleri önceki aşamaları anlatır. `43b924d` Mac/Windows paket kaynak CI ve Verify geçti. Sonra cwd/API-only düzeltildi; son kaynak CI ayrıca izlendi.

Hazırlanan sunucuda HostOps ayrı yetkisiz servis olarak yerelde çalıştı; işletmeci yetkisi yok, Agent kapalıydı. Normal test üyesi ve anonim istemci yönetimden reddedildi. Gerçek CPU/bellek/medya sayaçları alındı; sensör, medya kalite ölçümü ve doğrulanmış yedek bilinmiyor kaldı. Core konteynerleri değişmedi. İnsan PTY/rootless alan testleri Unicode, 33×91, Ctrl+C, ayırma, aracı yeniden oluşturma, tek işlem durumu ve sonlandırmayı geçti. Gerçek sınırlar: eşlenmiş UID 10001, yalnız loopback, salt okunur kök/Core bağı yok, 512 MiB/0,5 CPU/128 PID ve toplam cgroup/birim ölçümü. Core'da model/sağlayıcı görevi, baskı/kota doldurma veya fiziksel medya testi yapılmadı.

İşaretli Electron bileşenleri 1440×900/900×700'de yatay taşma olmadan sunucu/işletmeci açıklaması ve alan devral/aç/kapat/bağlan/bitir/devam kontrollerini geçti. Enjekte arayüz verisi gerçek PTY kabulünden ayrıdır.

RC10, RC9 baytlarını değiştirmemek için ayrı test sürümü ayrıldı. Windows iş akışı sürümü commit'ten alır, kurulu uzak giriş ikilisinin özet/yükleme/etkin olmama/onaysız red sonucunu denetler. O noktada besleme/katalog/kurulu istemci/yayın yükseltilmemişti. Canlı Access/vekil, gerçek model, yerel aktarım, fiziksel Mac↔Mac/Mac↔Windows/birlikte çalışma açıktı. Trello ilerlemesi kaydedildi; kart tamamlandı sayılmadı.

OPS-022: RC10 Windows'ta NSIS, kurulu ASAR/VLC ve ilk açılış geçti; yeni uzak modül doğrulayıcısının Playwright değerlendirmesinde dinamik import geri çağrısı yoktu. Gerçek Node yerleşik modül API'si kullanıldı; özet/yükleme/etkin olmama/onaysız red korundu. Test düzeneği hatasıdır, fiziksel giriş kabulü değildir.

## 15 Ekim 2026 — onaylı canlı yollar

Sahibi etkin oda sırasında açmayı açıkça onayladı. HostOps ve rootless Agent mevcut vekilden HTTPS yolu aldı. Özel köprü yalnız sağlık ve sürümlü açık uçları verir; giriş kuralı yalnız mevcut vekil konteynerine izin verir. Özel Agent yetkisi açık yola alınmadı. Yalnız Access yeniden oluşturuldu; diğer Core konteyner kimlikleri aynı doğrulandı. Bu adım istemci/besleme/katalog/kurulum yayını değildi.

OPS-023: tek dosya bind mount ayarı değiştirilince konteyner eski inode'u okumayı sürdürdü; sağlık 404 verdi, koruma Access/vekili geri aldı. İncelenen ayar hem kalıcı sunucu yoluna hem mevcut bağa yazılıp normal yeniden yükleme ve HTTPS sağlık doğrulaması yapıldı. Geri dönüş kopyaları ve konteyner karşılaştırması korundu. Yapılandırma hatasıydı; otomatik güvenlik onayı reddi değildi.

Sonra iki açık sağlık ucu geçti; normal üye sunucu görmedi, anlık görüntüde 403 aldı; anonim izleme/Agent görevi 401 aldı. Yalnız yeni QA oturumu kapatıldı. Eski oturum/hesap/müzik verisi/kurulu RC9 korundu.

Son uygulama kaynağı `d8434eb`: 141 dosya/896 test, kesin TypeScript, lint, derleme, gerçek PTY/rootless ve açık paket kontrolleri geçti. İmzalı/noter onaylı Mac RC10 bu kaynaktı. Windows RC10, `2d59ff8` üzerindeki 38754039538 çalışmasında kurulum, ASAR eşitliği, sentetik VLC görüntüsü, 900×700/1440×900 ilk açılış/ayarlar ve yerel giriş özet/yükleme/etkin olmama/onaysız reddi geçti. Son kaynak farkı yalnız Windows test düzeneğidir. Windows imzasızdır. Ayrı paketli Mac profili de hesapsız, OS girdisi etkinleştirmeden açılış/boyut/VLC/onaysız red geçti.

Açık koşullar: gerçek sahip masaüstünden HTTPS terminal; sahibin yapılandırdığı API model/görev/devral/durdur; Sunucu görünümü dışında uyarı; eksik medya kalitesi/servis hata/yedek kaynakları; uzun ses/DJ birlikte çalışma; fiziksel Mac↔Mac ve Mac↔Windows onay/giriş/izin/iptal/gecikme. O noktada Agent kullanılamıyor gösteriliyor, verilmiş kimlik/model bulunmuyor, isteğe bağlı servisler açılışta otomatik başlamıyordu. Tam plan kabulü için bunlar gerekir.

## 15 Ekim 2026 — sahibin onayladığı RC10 arkadaş testi

Sahibi açık fiziksel kabulden önce test yayınını istedi. v0.1.18-rc.10, imzalı/noter onaylı Apple Silicon DMG/ZIP, imzasız Windows x64, eşleşen kaynak/lisans ve manifestlerle yayımlandı. GitHub özetleri doğrulanmış adaylarla eşleşti. Davetli portal iki RC10 platformunu grupladı; yetkili katalog ve iki indirme HEAD/boyut kontrolü geçti, RC9 korundu. Mac beslemesi sürüme sabit GitHub arşivi sundu. Sahibin istemcisi kurulmadı veya hesabından çıkılmadı.

Bu yayın açık koşulları kapatmaz. Agent normal sahip API-model ayarı ve gerçek görev kabulüne kadar kullanılamaz. Fiziksel uzaktan kontrol, ses/medya/birlikte çalışma ve uyarı kabulü yayın notlarında açık belirtildi. PR28 o yayın noktasında taslaktı; sonraki birleştirme/güncel yayın için [RC11](RC11_RELEASE.md) ve [RC12](RC12_RELEASE.md) kayıtlarına bakın. Arkadaş testi tam plan kabulü değildir.
