# RC30 — Stremio ve tam denetim düzeltmeleri

Sinema'ya Stremio geldi. Ayrıca 2026-10-22'deki çok ajanlı tam proje denetiminin doğruladığı hataların çoğu düzeltildi.

## Stremio Sinema'da

- **Bağlama:** Ayarlar → Sinema → **Stremio** bölümünden Stremio hesabını bağla. Tarayıcıda Stremio'nun kendi onay sayfası açılır, şifren Tayfa'ya gelmez.
- **Salon sekmesi:** Salonda Diziler ile YouTube arasında bir **Stremio** sekmesi açılır. Hesabı bağlayan kişi kendi "izlemeye devam et" satırını ve kitaplığını görür. Herkes Cinemeta'nın popüler başlıklarını, aramasını ve ayrıntıları görür.
- **Kaynaklar:** Bir film veya bölüm için Stremio'daki eklentilerin (ör. Real-Debrid ile Torrentio) bulduğu kaynaklar kalite, boyut ve "Hazır/İndirilecek" durumuyla listelenir. Seçilen kaynak sunucudan salondaki herkese aynı anda oynar. Kaynakları sahip ve yöneticiler seçer.
- **IPTV olmadan da çalışır.**
- **Torrentio sunucunun adresini engelliyor:** Cloudflare veri merkezi IP'lerini reddediyor. Torrentio kaynaklarını hesabı bağlayan kişinin bilgisayarı kendi adresinden listeler ve debrid bağlantısını orada çözer; sunucuya yalnızca son indirme bağlantısı gider.
- **Güvenlik:** Hesap ve debrid anahtarları sunucuda şifreli kalır, üyelere gitmez. Yalnızca doğrudan bağlantılar oynar; sunucu torrent indirmez. Ayrıntılar [Topluluk Sineması](COMMUNITY_CINEMA.md#stremio) belgesinde.

## Denetimden gelen düzeltmeler

- **Sunucu yükü:** Caddy arkasındaki bütün istemciler tek bir istek sınırını paylaşıyordu; yaklaşık yedi açık uygulamada özel aramalar düşüyor, dakikada beş kayıt herkesi engelliyordu. Sınırlar artık istemci başına.
- **Asistan:** Görev onayı, iptali ve kurtarması yalnızca görevin sahibine ve yöneticilere açık.
- **DJ listeleri:** Ortak listeleri değiştirmek için DJ'i yönetme izni gerekiyor.
- **Uzaktan kontrol:** 13 Ekim'den beri çalışmıyordu; yeniden açıldı.
- **Masadan kalk:** Koltuğu gerçekten boşaltıyor.
- **Kamera seçimi:** Ayarlar'da seçilen kamera odalarda ve özel aramalarda kullanılıyor.
- **Kanal izinleri:** Kaydedilmemiş değişiklikler gelen mesajlarla silinmiyor.
- **Ayarlar:** Ayarlar açıkken mikrofonu açıp kapatmak "kaydedilmemiş değişiklik" uyarısı çıkarmıyor.
- **Çevrimdışı açılış:** Sunucu kısa süre kapalıyken uygulama "çıkış yapılmış" gibi davranmıyor; oturum bekler ve kendiliğinden açılır.
- **Sağırlaştırma:** Odaya taşınınca, yeniden katılınca veya oda değiştirince korunuyor.
- **Mikrofon:** Bağlantı yeniden kurulurken de kapatılabiliyor.
- **Sohbet:**
  - "Önceki mesajlar" 1000 mesajdan sonra takılmıyor.
  - Yüklenmemiş bir mesaja gelen tepki, listeye bağlamsız düşmüyor.
- **Sinema:** Poster ızgarası 1000 öğede bozulmuyor.
- **Aktiviteler:** Tek bozuk oda bütün odaların botlarını durdurmuyor.
- **Asistan ekranı:**
  - Kendi istek sınırını aşıp boşalmıyor.
  - Yönetici olmayanlar hata yerine kendi geçmişlerini görüyor.
- **Bildirimler:**
  - Bahsetmeler kısma süresine takılmıyor.
  - Bildirime tıklayınca kanal açılıyor.
- **Özel aramalar:** Pencere arka plandayken de geliyor, zil çalıyor ve sistem bildirimi gösteriyor.
- **DJ:**
  - Süresi bilinmeyen parça kuyruğu kilitlemiyor.
  - Geçici bir hata oturumu ve kuyruğu silmiyor.
- **Sunucu makinesi:**
  - Yöneticiler ve sahip birbirini terminalden kilitlemiyor.
  - Profili silinmiş operatörün yetkisi kaldırılabiliyor.
- **Diğer:**
  - Holdem'de oturan oyuncu kendi fişini yeniden yazamıyor.
  - Klavye sekmesi gerçek bas-konuş tuşunu, Tanılama gerçek sürümü gösteriyor.

## Yeni küçük özellikler

- **Moderatörler** bir kanalda mesajları yönetme izinleri varsa başkalarının mesajlarını silebilir.
- **Dock rozeti:** Okunmamış bahsetmeleri ve özel mesajları gösterir (macOS).
- **iPhone davetleri:** iPhone'dan oluşturulan davet artık masaüstüyle aynı `https://…/davet/…` bağlantısıyla paylaşılır.

## Paketler ve doğrulama

Mac paketi imzalanıp noter onayı alır ve yayından önce bu Mac'te açılarak denenir. Windows paketi aynı commit'ten derlenir. Sunucuda access, activities, cinema, hostops ve music servisleri bu sürümle güncellenir.

Gerçek bir Stremio hesabıyla, iki istemcide uzaktan kontrolle ve gerçek bir ağ kesintisiyle cihaz denemesi ayrıca yapılır.
