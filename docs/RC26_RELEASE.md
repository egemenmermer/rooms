# RC26 — RMDB, düzgün akan canlı yayın ve davet bağlantıları

Arkadaş test sürümü. Sinema'ya salonun kendi film defteri RMDB geldi; canlı kanallar artık takılıp aynı sahneyi tekrar etmiyor. Topluluğa tek bir davet bağlantısıyla katılınıyor. Kanalda bildirilen ses ve sinema sorunları da bu sürümde.

## RMDB

Sinema'nın son sekmesi. Salonun izlediği her şeyin, Letterboxd gibi puanlanıp yorumlanan kaydı.

- **Kendiliğinden kayıt:** Salonda bir film ya da dizi bölümü en az 5 dakika oynayınca RMDB'ye girer. Sarmalar bu süreye sayılmaz; canlı kanallar girmez. İzlemenin %90'ı geçince "izlendi" sayılır.
- **Kaldığı yerden:** Yarım kalanlar **Devam et** satırında ilerleme çubuğuyla durur. **Devam et** salonda kaldığı yerin birkaç saniye öncesinden açar; bitmiş bölümde sonraki bölümü, bitmiş filmde baştan izlemeyi önerir. Kumanda sende değilse sıraya öneri olarak eklenir ve baştan başlar.
- **Puan ve yorum:** Herkes yarım yıldız adımlarıyla 0,5–5 puan verir, yorum yazar (en fazla 4000 karakter), isterse **Spoiler içerir** diye işaretler; spoiler'lı yorum tıklanana kadar bulanık görünür. Beğendiğin filme kalp atabilirsin. Listede topluluk ortalaması ve puan dağılımı görünür.
- **Günlük:** Her izlemenin tarihi ve o an salonda olanlar kaydedilir; tekrar izlemeler ayrı satırdır. Salon dışında izlediğini **İzledim** ile elle ekleyebilirsin.
- **Elle ekleme ve İzlenecekler:** Filmler ve Diziler sekmelerindeki ayrıntılarda **RMDB'ye ekle** ve **İzlenecekler'e ekle** var. İzlenecekler salonun ortak listesidir.
- **IPTV kapansa da kalır:** Kayıtlar, puanlar, yorumlar ve afişler sunucuda IPTV hesabından ayrı, şifreli tutulur. Hesap kaldırılınca da RMDB yerinde durur; hesap değişirse aynı yapım yeni katalogda adıyla ve yılıyla bulunup yeniden açılabilir.
- **Kim ne yapar:** Herkes kendi puanını, yorumunu ve kendi eklediği günlük satırını değiştirir. Sunucu sahibi başkasının yorumunu, bir günlük satırını veya bir yapımı tümüyle kaldırabilir. Ayrıntı: [Topluluk Sineması · RMDB](COMMUNITY_CINEMA.md#rmdb).

## Sinema

- **Canlı kanallar akıyor:** Canlı yayının takılması veya aynı sahnenin döngüye girmesi düzeldi. Oynatıcılar artık sunucunun saatine değil, yayın aktarımının kendi canlı kenarına hizalanıyor; izleyiciler yine en fazla yaklaşık iki saniye farkla aynı anı görür. Düzeltme masaüstünde ve iPhone'da.
- **Filmler geri sarılmıyor:** Sağlayıcı yavaşken filmin iki saniyede bir geri sarılması düzeldi.
- **Ok tuşları:** ← ve → sinemanın her yerinde filmi 10 saniye sarar; bastıkça ekranda toplanır ("20 sn ileri · 21:21"). Kumanda ev sahibindeyse ekran bunu söyler; canlı kanallar sarılamaz.
- **Arka planda devam:** Sinema açıkken ses odasına geçersen salon sağ alttaki küçük oynatıcıda sürer. Büyüt, kendin için sessize al veya kapat.
- **Eski oda sineması kaldırıldı:** Ses odasının içindeki eski sinema ve Birlikte izle sayfaları masaüstünden ve iPhone'dan kalktı; ortak izleme soldaki **Sinema** salonunda. Eski sürümlerin başlattığı eski oturumlar "Eski Sinema · bu sürümde açılmıyor" olarak görünür ve bitirilebilir.

## Ses odası

- **Doğru mikrofon:** Seçtiğin mikrofon takılıyken ROOMS başka bir mikrofondan yakalamaya devam ediyorsa artık ona geri geçer; kulaklık sonradan takılsa veya kopup gelse de. Ayarlar → Ses ve video, bağlıyken **Odada duyulan mikrofon** satırını gösterir. Kulaklığın kendi sessize alma tuşunun çalışmaması büyük ihtimalle bundandı.
- **Soldaki listeden ses ayarı:** Odalar listesinde birine sağ tıklayınca kişiye özel ses ayarı artık moderasyon yetkisi olanlarda da görünür. Menü tuşu veya Shift+F10 da aynı menüyü açar.
- **Ekran paylaşımı kutusu:** Paylaşılan ekran sol altta ince bir çizgi yerine sunucunun yanında 16:9 bir kutu olarak görünür; **Yayını izle** ile açılır.

## Davet bağlantıları ve başlangıç ekranı

- **Tek bağlantı:** Davet kodu yerine `https://<sunucu>/davet/…` bağlantısı gelir. Bir bağlantı 7 gün geçerlidir ve 10 kişiyi alır. Topluluk yönetimi → **Davetler** bölümünden bağlantılar listelenip iptal edilir.
- **Başlangıç ekranı:** **Kayıt ol**, **Giriş yap** ve **Kendi sunucunu kur** sekmeleri. Kayıtta davet bağlantısını yapıştırmak yeter; sunucuyu bağlantı belirler. Kendi sunucunu kur sekmesi tek komutla kurulum adımlarını kısaca gösterir.
- Sunucu tarafı 19 Ekim'de güncellendi; eski sürümler çalışmaya devam eder.

## Paketler ve doğrulama

Mac için Apple Silicon/macOS 14+ imzalı ve noter onaylı paket, Windows x64 için imzasız arkadaş test paketi hedeflenir. iPhone build 23 TestFlight'a gider. Sunucuda sinema servisi (RMDB) güncellenir; erişim servisi davet bağlantıları için 19 Ekim'de güncellenmişti.

**Otomatik kontroller:** Birleşik dalda tip kontrolü, lint, tam test paketi (1689 test), masaüstü ve servis derlemeleri ile Electron kabul testi geçti. iPhone'da 246 test ve imzasız cihaz derlemesi geçti. RMDB arayüzü tarayıcıda örnek veriyle denendi. Docker uçtan uca testleri bu sürüm için çalıştırılmadı.

**Açık kalanlar:**

- Canlı kanallar gerçek IPTV hesabında, masaüstünde ve iPhone'da birlikte henüz denenmedi.
- RMDB'nin kendiliğinden kaydı, **Devam et** ve afiş kopyaları gerçek sunucuda henüz denenmedi. Yarım bırakılan izlemenin kayıtlı konumu en fazla yaklaşık 1,5 dakika geride kalabilir.
- HyperX ve diğer kulaklıklarda mikrofon takibi, iki bilgisayarda kişiye özel ses ve köşedeki oynatıcı gerçek cihazda henüz denenmedi.
- Davet bağlantısıyla gerçek bir arkadaşın katılımı henüz denenmedi.
