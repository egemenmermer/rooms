# RC21 — Ses odasında taşıma, sohbette video, ekolayzır ve Discord gibi düzen

Arkadaş test sürümü. "bugs & features" kanalında açık kalan istekleri ve Discord karşılaştırmalarını içerir.

- Ses odalarında moderasyon: yetkisi olan, sol listede birini başka bir odanın üstüne sürükleyerek taşır; sağ tıkla "Odaya taşı", "Sesten çıkar", "Topluluktan çıkar" ve "Yasakla" seçilir. "Odalar arasında taşı" ve "Üyeleri yasakla" rol izni olarak verilebilir. Topluluk sahibi taşınamaz, çıkarılamaz.
- Sohbette video: Mac ekran kayıtları ve iPhone videoları (.mov, .m4v) gönderilebilir, paylaşılan videolar sohbette oynar. Sunucunun dosya sınırı (şu an 20 MB) açıkça söylenir.
- DJ için kişisel ekolayzır: bas, orta ve tiz; yalnızca ayarlayanın duyduğu sesi değiştirir.
- Mesaj kutusunda GIF, emoji ve uygulamalar düğmeleri. Uygulamalar ve Etkinlikler aranabilir bir katalogda: Sinema, ekran paylaşımı, dört oyun, beyaz tahta, anket, DJ ve asistan; oyun seçince doğrudan masa kurulumu açılır. Üst bardaki DJ ve Etkinlikler yazıları ikon oldu.
- GIF araması KLIPY ile çalışır (Tenor'un API'si 30 Haziran 2026'da kapandı). Sunucuya KLIPY anahtarı eklenene kadar GIF düğmesi bunu söyler.
- Özel aramalar konuşma başlığından başlar; ses odasındayken de aranabilir, oda yalnızca arama bağlanınca bırakılır.
- Sunucu ayarları: ad, açıklama, ikon ve afişle Discord gibi sunucu profili ve canlı önizleme. Topluluk menüsünde "Sunucu ayarları". "Sunucu makinesi" sayfası yalnızca topluluk sahibine görünür; sahibine yanlışlıkla "yetkin yok" denmesi düzeltildi.
- Mac'te güncelleme gelince ayarlar çarkının yanında parlayan bir düğme çıkar; tıklayınca tek adımda yeniden başlatıp kurar.
- Tam ekrandayken kırmızı tuşla kapatınca kalan siyah ekran düzeltildi; pencere geri açılınca tam ekrana döner.
- Whiteboard imleçleri ve yayını kimlerin izlediği bilgisi artık gerçek sunucuda da karşı tarafa ulaşır.
- Mac: uygulamadaki Güncelleme ve hakkında bölümünden kontrol et. Windows: yeni EXE'yi indirip kur; paket imzasız arkadaş testidir.

## Paketler ve doğrulama

Mac için Apple Silicon/macOS 14+ imzalı ve noter onaylı paket; Windows x64 için imzasız arkadaş test paketi bu sürümün hedefidir. Access ve sunucu makinesi (hostops) servisleri bu sürümle güncellenir: taşıma, veri kanalı izni, GIF araması ve sahiplik kontrolü bunlara bağlıdır. Kaynak testleri ve yerel paket kontrolleri; taşıma, imleçler, ekolayzır ve güncelleme düğmesinin iki gerçek cihazla kabulü yerine geçmez.
