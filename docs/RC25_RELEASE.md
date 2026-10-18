# RC25 — Sinemada altyazılar ve kişisel giriş sesleri

Arkadaş test sürümü. Sinema salonunda filmler ve dizi bölümleri artık altyazıyla izlenebilir. Ses odasına girerken ve çıkarken herkes kendi sesini seçebilir.

## Giriş sesi

- **Kendi sesin:** Ayarlar → Ses ve video → **Giriş ve çıkış sesin** bölümünden odaya girince ve çıkınca çalacak sesi seç. 8 özgün ROOMS sesi var (Fanfar, Kapı zili, Arcade, Portal, Damla, Kristal, Kapanış, Hoşça kal). Seçim hemen kaydedilir ve tüm cihazlarında geçerli olur.
- **Kendi dosyan:** Masaüstünde bir ses dosyası seç (MP3, WAV, OGG, FLAC; en fazla 20 MB ve 5 dakika), en fazla 4 saniyelik kesiti belirle, dinle ve kaydet. Kişi başına 6 ses saklanır. Telifli müzik, başkasının sesi veya rahatsız edici içerik yükleme.
- **Herkes aynı seviyede duyar:** Sunucu her sesi ölçüp aynı yüksekliğe getirir. Sesler mikrofondan gitmez; herkesin cihazında yerel çalar.
- **Dinleyen karar verir:** Ses ve video ayarlarında **Kişisel giriş sesleri** kapatılınca herkes için klasik ses çalar. **Efekt ses düzeyi** bu cihazdaki seviyeyi ayarlar. Odada bir kişiye sağ tıklayıp **Giriş sesini sustur** yalnızca senin cihazında o kişinin sesini kapatır.
- **Gürültü olmaz:** Aynı anda tek kişisel ses çalar. Bağlantısı kopup hemen dönen biri için ses çalmaz. Aynı kişinin sesi en fazla 2 dakikada bir çalar. Ayrıntı: [Giriş sesi rehberi](PERSONAL_SOUNDS.md).
- **iPhone:** Build 22 ile başkalarının seslerini duyar ve kendi sesini kütüphanenden seçersin. Yükleme şimdilik masaüstünde.

## Sinema

- **Filmin kendi altyazıları:** Dosyanın içindeki metin altyazıları (SubRip, ASS/SSA, mov_text, WebVTT) salonda gösterilir. Örneğin Tuner (2026) gömülü Türkçe altyazısıyla açılır.
- **Çevrimiçi altyazılar:** Kendi altyazısı olmayan filmler ve bölümler için salon SubDL'de Türkçe ve İngilizce altyazı arar. Bunun için topluluk sahibi bir kez Sunucu ayarları → Sinema → **Altyazılar** bölümüne kendi ücretsiz SubDL API anahtarını girer. Anahtar sunucuda şifreli kalır, kimseye gösterilmez.
- **Kendi dosyan:** Altyazı menüsündeki **Dosyadan yükle…** ile SRT, VTT ya da ASS dosyası seçilebilir. Eski Türkçe dosyalardaki Windows-1254 kodlaması da okunur.
- **Herkes kendi altyazısını seçer:** Seçim yalnızca seni etkiler. Salon başka bir dil duyuyorsa Türkçe altyazı kendiliğinden açılır; kapattıysan bir daha açılmaz.
- **Zamanlama:** Altyazı başka bir sürüm için hazırlanmışsa menüdeki zamanlama satırıyla yarım saniyelik adımlarla erkene alıp geciktirebilirsin.
- **SubDL düzeltmesi:** Anahtar girildikten sonra "Çevrimiçi altyazı bulunamadı" çıkması düzeldi; SubDL'nin indirme adreslerine eklediği anahtar artık sonuçları elemiyor (#65).

## Paketler ve doğrulama

Mac için Apple Silicon/macOS 14+ imzalı ve noter onaylı paket, Windows x64 için imzasız arkadaş test paketi hedeflenir. Altyazılar ve giriş sesi ayarları yalnızca yeni masaüstü sürümünde görünür. Sunucuda sinema servisi (altyazılar ve SubDL düzeltmesi) ile erişim servisi (giriş sesleri) güncellenir. Eski sürümler başkalarının giriş seslerini duymaz, klasik sesi çalmaya devam eder.

**Otomatik kontroller:** Tam test paketi, lint ve tip kontrolü geçti. Gerçek ffmpeg 9.0.2 ile seyrek SubRip ve ASS izli bir filmde altyazı zamanlaması ve okuma hızı denendi. Production'da yeni röle kodu Tuner'da 600. saniyeden çalıştırıldı:

- ilk altyazı kaynaktaki zamanla birebir aynıydı (634,347 sn);
- akış hedef hızın en fazla 3,7 saniye önüne geçti.

Altyazı menüsü, dosyadan yükleme, zamanlama ve Altyazılar ayarları tarayıcıda örnek veriyle denendi.

Giriş sesleri için tam test paketi (1599 test), iPhone'da 243 test ve imzasız cihaz derlemesi geçti. Yerel yığında iki gerçek masaüstü istemcisi, gerçek erişim servisi ve LiveKit ile uçtan uca denendi: seçilen ses diğer üyede birebir çalıyor, oda içindeki değişiklik canlı uygulanıyor, sesleri kapatan dinleyici klasik sesi duyuyor.

**Açık kalanlar:**

- Düzeltmeden sonra gerçek SubDL anahtarıyla arama, iki fiziksel bilgisayarda altyazılı film izleme ve Windows'ta dosyadan yükleme henüz denenmedi.
- Giriş seslerinde duyulabilirlik ve ses düzeyi dengesi, Windows'ta çalma, iPhone hoparlöründe yankı, Bluetooth ve kilitli ekran gerçek cihazlarda henüz denenmedi.
