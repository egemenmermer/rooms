# RC24 — Sinemada ses dili, kalite seçimi ve sıra temizleme

Arkadaş test sürümü. RC23 sonrası "bugs & features" kanalına yazılanları düzeltir.

## Sinema

- **Ses dili:** Sunucu filmin tüm ses izlerini okur ve Türkçe olanı seçer; Türkçe yoksa dosyanın varsayılan izini alır. Oynatıcıdaki **Ses** menüsünden kumandayı tutan kişi dili herkes için değiştirir; yayın yeni izle yeniden başlar.
- **Kalite:** Film ve dizi ayrıntılarında aynı içerik başka kalitede de varsa (FHD, 4K…) seçilebilir.
- **Sırayı temizle:** Sıra panelinde oynayan dışında her şeyi kaldırır (iki tıklama). Sıra doluyken bir şey açılırsa önce en eski izlenmiş öğeler düşer.
- **Kanal listesi** aşağı kaydırınca çökmüyor.
- **Sohbet kutusu** salon panelinin genişliğine sığıyor.
- **YouTube** Filmler/Diziler gibi: bağlantı alanı başlıkta, salonda oynayan video, Sırada ve İzlenenler ızgaraları. Başlıksız eklenen videoların adları YouTube'dan alınır.

## Ses

- Mikrofon güncelleme ya da yeniden başlatma sonrası en son bırakıldığı gibi açılır; yalnızca ilk girişte kapalıdır.

## Paketler ve doğrulama

Mac için Apple Silicon/macOS 14+ imzalı ve noter onaylı paket, Windows x64 için imzasız arkadaş test paketi hedeflenir. Sunucuda sinema ve Activities servisleri güncellenir (ses dili ve `queue.clear` için).

**Otomatik kontroller:** Tam test paketi, lint ve tip kontrolü geçti. Gerçek ffmpeg ile iki ses izli (Almanca + Türkçe) bir filmde Türkçe izin otomatik seçildiği ve elle Almanca'ya geçildiği denendi. Kaydırma, sohbet kutusu, YouTube, Sıra paneli ve ses menüsü tarayıcıda örnek veriyle görsel olarak kontrol edildi.

**Açık kalanlar:** Gerçek sağlayıcının dil etiketleri, iki fiziksel bilgisayarda dil değiştirme ve kalite seçimi henüz denenmedi.
