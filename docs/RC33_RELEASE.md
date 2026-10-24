# RC33 — Tayfa artık önizleme değil: oyunlar, İngilizce ve baştan sona cila

## Dil

- **Türkçe ve İngilizce:** Tayfa sistem dilini izler; Ayarlar'dan **Sistem / Türkçe / English** seçilebilir. Menüler, hata mesajları ve davet sayfası da iki dilde.

## Kıraathane: yedi oyun, gerçek masa hissi

- **Yeni oyunlar:** **Pişti** (2 kişi ya da 4 kişi eşli, 101/151/251'e), **Okey** (klasik, 12-13-1 ve çift bitiş dahil) ve **Tavla** (mars, 3/5/7 puanlık maç). Hepsinde bot ve el sonu özeti var.
- **Gerçek masa:** Her oyunun kendi masası var. Kartlar ve taşlar oynayanın önüne düşer, el alanın tarafına süpürülür. Rakibin son hamlesi görünür kalır, sıra kimdeyse onun koltuğunda süre döner.
- **101 ve Okey:** Sürükle-bırak ıstaka, **Seri diz / Çift diz**, köşelerde atılan taşlar. Okey ve sahte okey takımdaki gibi çizilir.
- **Batak:** Sıradaki oyuncu sağda, eller renge göre dizili. İhale geçmişi, "Koz kırıldı" işareti ve puan cetveli var.
- **Blackjack:** Masadaki herkesin eli görünür, fiş yığınları ve ödeme animasyonu var. Sigorta ve teslim olma seçenekleri eklendi.
- **Hold'em:** Fiş yığınları, pota kayan bahisler, yan pot etiketleri, son hamle balonları, pot oranlı artırma ve el kaydı.
- **Hep elinin altında:** Kendi elin, ıstakan ve hamle düğmelerin pencere küçük olsa da ekranda kalır.
- **Ev kuralları masa ayarı oldu:**
  - 101: işlek taş cezası, elden bitme, yandan alınıp kullanılmayan taş cezası, gösterge, isteğe bağlı 12-13-1.
  - Batak: koz kırılmadan koz açılmaz.
  - Blackjack: sigorta ve teslim.
- **Takılan masa kalmadı:**
  - Bot ya da masada olmayan oyuncunun koltuğu boşaltılabilir.
  - Masa sahibi kalksa da oturan herkes el dağıtabilir.
  - Hold'em'de masada olmayan oyuncu artık parasını riske atmaz, pas geçer.
- **Sesler ve "Sıra sende":** Dağıtma, oynama, zar ve sıra sesleri eklendi. Başka bir sayfadayken sıra sana gelince "Masaya dön" bildirimi çıkar.

## Daha derli toplu bir uygulama

- **Kenar çubuğu:** Ana sayfa, Arkadaşlar, Bildirimler ve Mesajlar tek tıkla açılır; arkadaşlık isteği ve okunmamış bahsetme rozetleri var.
- **Ana sayfa:** Kim hangi sesli odada, şimdi sinemada ne oynuyor, okunmamış sohbetler ve çevrim içi arkadaşlar burada.
- **Mesajlar:** Son mesaj önizlemesi, saat ve okunmamış işaretiyle özel mesaj listesi.
- **Sohbet:** Yanıtlar artık pencere açmadan, yazma alanının üstünde. Tepki seçici mesajın yanında açılır.
- **Komut paleti ve kısayollar:** Klavyeyle tam gezilebilir, Türkçe harfleri doğru arar.
- **Ayarlar:** Çalışmayan seçenekler kaldırıldı, vurgu rengi seçici artık gerçekten çalışıyor. Topluluk sekmeleri yalnızca yetkisi olana görünür.
- **İlk açılış:** Avatar seçimi ve mikrofon testi kurulumun içinde, canlı ses seviyesiyle.
- **Görünüm:** Tek tip butonlar, alanlar ve boş/yükleniyor/hata ekranları; en küçük yazı 11 piksel.

## Ses ve bağlantı

- **Otomatik yeniden katılma:** Ses tamamen koparsa Tayfa odaya kendiliğinden yeniden bağlanır. Mikrofon kapalı gelir.
- **Çıkış güvenilir:** Sesten ayrılma hata verse bile çıkış her zaman tamamlanır.
- **DJ:** Sunucu yeniden başladığında çalan müzik artık kesilmez.

## Kayıt ve güvenlik

- **Onaylı kayıt daha sağlam:** Onay kodu kaybolmaz, süresi dolan onaylar kapanır, yönetici bekleyen istekleri topluca reddedebilir.
- **Sunucu tarafında sağlamlaştırma:** Sinema aktarımı, asistan notları ve bot varsayılanları sıkılaştırıldı.

## iPhone

- **Oyunlar:** Yedi oyunun hepsi telefonda oynanabilir. 101, Okey ve Tavla yatay ekranda açılır, oyun sesleri de var.
- **Kayıt ve giriş:** Davet linki ya da onay isteğiyle kayıt olunabilir, iki adımlı giriş (MFA) çalışır, davet kodu girilebilir.
- **Güvenlik:** Kullanıcı engelleme ve şikâyet, moderatörün mesaj silmesi.
- **Bağlantı:** Bağlantı koparken mikrofon kapatılabilir, ağ yokken açılışta "tekrar dene" ekranı çıkar, çevrimdışı çıkış sonradan tamamlanır.

## Paketler ve doğrulama

Mac paketi imzalanıp noter onayı alır, Windows paketi aynı commit'ten derlenir. Sunucuda access, activities, cinema, agent ve claude-bot servisleri güncellenir.

Otomatik testler (yaklaşık 2500 masaüstü, 460 iPhone testi) ve her oyunun ekran görüntüsü kontrolü geçti.

Yeni oyunların gerçek iki istemciyle oynanması ve iPhone'da cihaz kabulü ayrıca denenir.
