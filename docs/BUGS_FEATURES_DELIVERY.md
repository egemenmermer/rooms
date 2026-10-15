# Hata ve özellik teslim kaydı

Onaylanan sıra: masaüstü/iPhone hataları, ardından bahsetmeler, ortak topluluk listeleri ve açık DJ eşleştirme seçimleri. Mevcut hesaplar, yayın arşivleri ve mobil çalışma değişiklikleri korunur. Otomatik kontroller fiziksel kabul anlamına gelmez. Bu kayıt uygulama aşamalarını anlatır; sonraki yayınlar için [RC11](RC11_RELEASE.md) ve [RC12](RC12_RELEASE.md) notlarına bakın.

## Uygulamadan önce kaydedilenler

- BF-001: sağırlaştırılmış durumda üstü çizili kulaklık ikonu yok.
- BF-002: ses panosu klibi yayımlanıyor fakat gönderen kendi tarafında duyamıyor.
- BF-003: izlenen ekran, yayıncıdan bağımsız kapatılamıyor.
- BF-004: ekran sesi katılımcı konuşmasından bağımsız ayarlanamıyor.
- BF-005: aynı uzunluktaki geçmişler dahil kanala girişte kaydırma üstte kalabiliyor.
- BF-006: büyütülen görsel küçük; dosya bağlantıları yetkili indirmeyi güvenilir başlatmıyor.
- BF-007: masaüstü penceresini kapatmak görüşmeyi korumak yerine medya görünümünü yok ediyor.
- BF-008: yerel iPhone kesinti yönetimi önceki kullanıcı niyetini geri getirmeden mikrofonu kapatıyor.
- BF-009: DJ'de ayrı kuyruğa ekle ve atomik şimdi çal gerekiyor; boş/bitmiş kuyruk başlamalı.
- BF-010: bahsetmede üye seçimi ve yeniden bağlanmada çift bildirim olmadan mevcut bildirim teslimi gerekiyor.
- BF-011: belirsiz eşleştirmede genel hata yerine açık aday seçimi gerekiyor.
- BF-012: kalıcı ortak listeler, kuyruk/geçmiş kaydı ve YouTube içe aktarımı gerekiyor.

Ertelenenler: tam Spotify liste yetkisi/içe aktarımı, kapalı iPhone bildirimi, eşzamanlı sözler ve ek birlikte izleme sağlayıcıları. Mevcut DM, IPTV ve geçmiş için yeniden yazım değil regresyon kontrolü gerekir.

## Kabul

Odaklı regresyonları, lint/tür/derlemeyi ve yalıtılmış masaüstü boyut/klavye kontrollerini gerçek Mac/Windows/iPhone aktarımından ayrı kaydedin. Fiziksel gönderen öz dinlemesi, bağımsız ekran sesi/kapatma, gizli pencerede görüşme ve iPhone kesinti dönüşü katılımcı gerektirir. Örnek durumlarla kabul edildi saymayın. İlgili kontroller ve açık dağıtım yetkisi sonrası yeni aday yayımlayın; RC10 baytlarını değiştirmeyin.

## İlk uygulama kontrol noktası

BF-001–007: üstü çizili ikon; yalnızca klibi gönderenin dinlemesi; açık galeri kapatma ve Sinema dahil kaynağa özel ekran sesi; hesaba bağlı kayıtlı düzeyler; eşit uzunluktaki kanala geçiş ve geç yüklenen görsel düzeninde kaydırma; büyük görsel görünümü ve mesaja bağlı yerel kaydetme; kaydedilmiş açık vazgeçme tercihine saygılı arka planda yaşatma varsayılanı. Mikrofon girişi yerelde dinletilmez. Galeri kapatma video görünümünü ayırır ve uzak ekran sesini susturur; abone olunan video bant genişliğini henüz azaltmaz. Fiziksel oynatma kabulü açıktır.

BF-009: isteğe bağlı `playNow`, eski ekleme komutlarıyla uyumludur. Arayüz kuyruğa ekle/şimdi çal eylemlerini ayırır; çalışan yalnızca açık şimdi çal veya boş/bitmiş kuyrukta yeni eklenen ilk kaydı sırayla seçer. Normal ekleme duraklatılmış müziği başlatmaz.

Yerel kontrol noktasında tam `verify:ci`, 142 dosya/903 test, lint/TypeScript, masaüstü/bildirim/servis derlemeleri başarılıydı. Odaklı testler ekran/konuşma sesi, yeni izler/sağırlaştırma, klip yönlendirme, sınırlı indirme/yetki iptali, eşit geçmişli kanal geçişi, pencere politikası ve kuyruk eylemlerini kapsadı. Bu aşamada dağıtım, kurulum paketi veya yayın yapılmadı.

BF-008 ayrı yerel mobil depoda `692a459` commit'iyle uygulandı. 105 çekirdek test ve imzasız iPhone hedef derlemesi başarılıydı; fiziksel kesinti/dönüş açıktı. Önceden var olan mobil arayüz değişiklikleri korundu; mobil push/kurulum/yayın yapılmadı.

## Bahsetme ve ortak DJ listeleri kontrol noktası

BF-010: klavye/tıklama seçimi aynı görünen adlı kişiler dahil metni gerçek kullanıcı kimliğine bağlar. Metni düzenlemek bağı kaldırır. DM önerileri konuşmayla, topluluk sorguları/önbellekleri hesap/sunucu/kanalla sınırlıdır. Kanonik bahsetmeler okunur ad gösterir. Bildirim ekranı gerçek sunucu bahsetme/okundu kayıtlarını kullanır, sınırlı geçmiş aramasıyla ilgili mesaja gider. İsteğe bağlı bildirim, kanal susturma ve ses sırasında bastırma tercihleri geçerlidir. Tekrarlanan teslimler onaylanmış bahsetmeyi yeniden eklemez veya yerel bildirimi tekrarlamaz. APNs eklenmedi.

BF-011: yeni istemciler açık eşleştirme adaylarını seçer. Temkinli eşleştirme başarısızsa ortak kuyruk değişmeden en fazla beş temizlenmiş açık YouTube seçeneği döner. Seçeneğin ayrı ekle/şimdi çal eylemleri vardır. Sağlayıcı reddi ile eksik/bozuk arama farklı hata kalır. Eski ekleme çağrıları önceki hata sözleşmesini korur.

BF-012: üyeler ortak liste oluşturabilir, adlandırabilir, düzenleyebilir, sıralayabilir, silebilir; kuyruğu/geçmiş oturumunu kaydedebilir; YouTube listesi alabilir; tüm listeyi ekleyebilir/çalabilir. Access topluluğu güncel oda yetkisinden çıkarır, kaynak alımından sonra tekrar denetler, yazmaları sıralar ve eski sürümü reddeder. Atomik dosyalar yeniden başlatmada kataloğu korur. Yalnızca açık YouTube kimliği/başlık/süre saklanır. 100 parçalık istek diğer Access isteklerinden bağımsız sınırlıdır; özel medya URL'leri reddedilir. Çakışma taslağı korur, yazmayı otomatik tekrarlamaz. Tek Access yazıcısı kullanın; [kurulum rehberindeki](SELF_HOSTING.md) dizini kalıcı tutup yedekleyin.

Takip incelemesi tüm sağırlaştırma kontrollerini ve galeri kaldırıldığında kendi PiP görünümünü kapatmayı kapsadı. Mobil `ccd5a6a`, yeniden katılımda elle mikrofon eyleminin otomatik geri yüklemeyle ezilmesini önledi; imzasız iPhone derlemesi tekrar geçti. Mobil değişiklikler yerelde kaldı; eski arayüz çalışmaları korunmuştu.

Yalıtılmış Electron arayüzü 1440×900 ve 900×700'de geçti: gerçek üretim bileşenleri, klavyeyle bahsetme/seç/gönder, büyük görsel/Escape, dar liste düzenleme/sıra/şimdi çal, ayrı ekran sesi/kendi görünümünü kapatma. Örnek işaretliydi; canlı hesap, sunucu, kabuk veya medya kullanmadı. Fiziksel medya kabulü değildir.

## Yayından ayrı izlenen kalan kabul

- Yetkili dağıtımda uyumlu Access/müzik sürümlerini birlikte kurun; yeni liste dizinini kalıcı tutun, normal hesap ve yetki iptalini sınayın. Önceki RC10 baytları korunmalıdır. Sonraki dağıtım durumu RC11/RC12 notlarında izlenir.
- Mac/Windows katılımcıları: klibi gönderen ve eşte bir kez duyma; konuşmayı değiştirmeden ekran sesini değiştirme; yayıncıyı durdurmadan izlemeyi bırakma; yeniden açıp kayıtlı düzeyleri doğrulama; görüşme sürerken uygulamayı gizleme/açma. Gerçek akışta tam ekran/PiP kontrolü.
- İki gerçek üye: bahsetme teslimi/okundu ve ortak liste düzenleme/içe aktarma/geçmiş tekrarı; mevcut DM, IPTV ve DJ ile birlikte. Birim örnekleri sağlayıcı/oda aktarımını kanıtlamaz.
- Fiziksel iPhone: çağrı/Instagram kesintisi, önceki açık/kapalı niyet, dönüşte elle susturma, düşen aktarım sonrası yeni yetki ve izin reddi. Bu çalışmada telefon kurulumu, provizyon veya App Store işlemi yapılmadı.
- Tam Spotify listesi, kapalı iPhone bildirimi, eşzamanlı sözler ve ek video sağlayıcıları ertelendi.

Bu uygulama aşaması tek başına yayın/besleme terfisi, sunucu dağıtımı veya sahip hesabı değişikliği yapmadı. Son yerel doğrulama `verify:ci`: 148 dosya/925 test, lint, TypeScript, masaüstü/bildirim/servis derlemeleri başarılı. Son ayrıştırıcı sıkılaştırması ayrıca odaklı sağlayıcı regresyonlarını ve yeniden lint/tür/uygulama/servis derlemesini geçti. Depo biçim kontrolü ve dağıtım platform politikası başarılıydı. Fiziksel kabul ayrı kalır.
