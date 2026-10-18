# RC25 — Sinemada altyazılar

Arkadaş test sürümü. Sinema salonunda filmler ve dizi bölümleri artık altyazıyla izlenebilir.

## Sinema

- **Filmin kendi altyazıları:** Dosyanın içindeki metin altyazıları (SubRip, ASS/SSA, mov_text, WebVTT) salonda gösterilir. Örneğin Tuner (2026) gömülü Türkçe altyazısıyla açılır.
- **Çevrimiçi altyazılar:** Kendi altyazısı olmayan filmler ve bölümler için salon SubDL'de Türkçe ve İngilizce altyazı arar. Bunun için topluluk sahibi bir kez Sunucu ayarları → Sinema → **Altyazılar** bölümüne kendi ücretsiz SubDL API anahtarını girer. Anahtar sunucuda şifreli kalır, kimseye gösterilmez.
- **Kendi dosyan:** Altyazı menüsündeki **Dosyadan yükle…** ile SRT, VTT ya da ASS dosyası seçilebilir. Eski Türkçe dosyalardaki Windows-1254 kodlaması da okunur.
- **Herkes kendi altyazısını seçer:** Seçim yalnızca seni etkiler. Salon başka bir dil duyuyorsa Türkçe altyazı kendiliğinden açılır; kapattıysan bir daha açılmaz.
- **Zamanlama:** Altyazı başka bir sürüm için hazırlanmışsa menüdeki zamanlama satırıyla yarım saniyelik adımlarla erkene alıp geciktirebilirsin.

## Paketler ve doğrulama

Mac için Apple Silicon/macOS 14+ imzalı ve noter onaylı paket, Windows x64 için imzasız arkadaş test paketi hedeflenir. Altyazılar yalnızca yeni masaüstü sürümünde görünür. Sunucuda yalnızca sinema servisi güncellenir.

**Otomatik kontroller:** Tam test paketi, lint ve tip kontrolü geçti. Gerçek ffmpeg 9.0.2 ile seyrek SubRip ve ASS izli bir filmde altyazı zamanlaması ve okuma hızı denendi. Production'da yeni röle kodu Tuner'da 600. saniyeden çalıştırıldı:

- ilk altyazı kaynaktaki zamanla birebir aynıydı (634,347 sn);
- akış hedef hızın en fazla 3,7 saniye önüne geçti.

Altyazı menüsü, dosyadan yükleme, zamanlama ve Altyazılar ayarları tarayıcıda örnek veriyle denendi.

**Açık kalanlar:** Gerçek SubDL anahtarıyla arama, iki fiziksel bilgisayarda altyazılı film izleme ve Windows'ta dosyadan yükleme henüz denenmedi.
