# RC22 — Sinema salonu: sunucunun IPTV'si herkes için aynı anda

Arkadaş test sürümü. Sol menüde kalıcı bir **Sinema** salonu gelir.

- **Salonu kurmak:** Topluluk sahibi, Sunucu ayarları → Sinema'dan bir yazı kanalını salon seçer ve sunucunun IPTV hesabını (Xtream ya da M3U, isteğe bağlı XMLTV rehberi) bir kez bağlar. Hesap kaldırılana kadar salonu görebilen herkes kullanır.
- **Gezinmek:** Canlı TV, Rehber, Filmler, Diziler ve YouTube sekmeleri var. Türkçe duyarlı arama, kalite rozetleri ve ülke bayraklarıyla kategoriler de gelir.
- **Birlikte izlemek:** Açılan şey herkes için aynı anda oynar.
  - Sunucu sağlayıcıya tek bağlantı açar, yayını salondakilere kendisi iletir.
  - Canlı kanallar herkeste aynı ana hizalanır.
  - Film ve dizilerde oynat, duraklat ve sar ortaktır.
- **Kumanda ve kısayollar:** Kumanda ev sahibinde olabilir; kumandası olmayan sıraya öneri ekler. Klavye: ↑/↓ kanal değiştirir, rakamla kanal açılır; Boşluk, F, M, C, G ve Ctrl/⌘ K kısayolları da çalışır.
- **Salonun düzeni:** Sağ panelde salon sohbeti, sıra ve izleyenler bulunur. Gezinirken yayın köşedeki küçük oynatıcıda sürer.
- **Gizlilik:** Hesap bilgileri sunucuda şifreli kalır, hiçbir üyeye gitmez. Kişisel medya (Medyam) ayrı ve özel kalmaya devam eder.
- **Eski Sinema:** Ses odasındaki eski Sinema (kendi dosyanla senkron, YouTube kuyruğu) `/cinema/room` adresine taşındı ve etkinliklerden açılmaya devam eder.

## Paketler ve doğrulama

Mac için Apple Silicon/macOS 14+ imzalı ve noter onaylı paket, Windows x64 için imzasız arkadaş test paketi hedeflenir. Sunucuda iki değişiklik gerekir:
- Activities servisi `hall` etkinliğiyle güncellenir.
- Yeni sinema servisi (`infra/cinema.Dockerfile`, `/rooms-cinema/*` yolu) devreye girer. Kurulum ve sınırlar için [Topluluk Sineması](COMMUNITY_CINEMA.md) belgesine bak.

**Otomatik kontroller:** Tam test paketi geçti. Gerçek ffmpeg ve Kanal'ın taklit IPTV sunucusuyla uçtan uca aktarım denendi:
- H.264/AAC, AC-3 5.1 → AAC stereo ve HEVC aktarıldı; MPEG-2 açık hata koduyla reddedildi.
- Film ve bölüm oynatıldı.
- 20 bin kanal, 60 bin film ve 8 bin dizilik içe aktarma 2,2 saniye sürdü.

**Açık kalanlar:** Gerçek bir IPTV hesabı, iki fiziksel bilgisayarda birlikte izleme, Windows'ta oynatma ve uzun canlı yayın bu sürümün kabul testleridir; otomatik kontroller bunların yerine geçmez. Altyazı, ses izi seçimi ve resim içinde resim henüz yok.
