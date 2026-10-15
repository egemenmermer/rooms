# RC11 arkadaş testi yayını

Bu belge 15 Ekim 2026 tarihli RC11 kontrol noktasıdır; güncel yayın için [RC12 notlarına](RC12_RELEASE.md) bakın. Proje sahibi birleştirmeyi, uyumlu servis geçişini ve masaüstü yayınını onayladı. Bu sürüm arkadaş testi içindir; açık fiziksel kabul koşullarının tamamlandığı anlamına gelmez. Mevcut hesaplar, kurulu uygulamalar ve önceki yayın arşivleri korunmalıdır.

## İçerik

- İşbirliği dalından sunucu izleme, kaldığı yerden devam eden sunucu terminali, sınırlı ortak Agent çalışma alanı ve onaylı uzaktan giriş kontrolleri. Agent çalıştırmak ayrıca yapılandırılmış sunucu, model ve yetki gerektirir.
- Bağımsız ekran paylaşımı sesi, kendi görüntüsünü kapatma/PiP temizliği, gönderenin ses panosunu dinlemesi, üstü çizili sağırlaştırma kontrolü ve kayıtlı tercihlere saygılı ilk açılış pencere davranışı.
- Kanal girişinde kaydırma, büyük fotoğraf görüntüleme ve mesaja bağlı yetkili yerel dosya indirme.
- Kimliğe bağlı bahsetme seçimi, gerçek bahsetme/okundu bildirimlerine gitme ve yeniden bağlanmada yinelenen bildirim önleme.
- Ayrı kuyruğa ekle/şimdi çal eylemleri, belirsiz parçada açık seçim, daha anlaşılır arama/sağlayıcı hataları.
- Kalıcı topluluk listeleri, sürüm çakışması koruması, üye düzenleme/sıralama/silme, YouTube içe aktarımı, kuyruk veya geçmiş oturumunu kaydetme.

## Uyumluluk ve yayın koşulları

Yeni istemciden önce Access ve müzik çalışanını birlikte yükseltin. `ROOMS_MUSIC_PLAYLISTS_DIRECTORY` kalıcı tutulup yedeklenmelidir; eski istemciler uyumludur. Yalnızca gerekli servis konteynerlerini yeniden oluşturun; önceki paket, imaj ve yapılandırmaları geri dönüş için koruyun. İlgisiz Core veya Hoppers servislerini yeniden başlatmayın.

Kaynak CI, Mac imzası/noter onayı/damgalama/Gatekeeper, yalıtılmış paket açılışı ve güncelleme teklifi, gerçek barındırılan Windows kurulum/yerel modül/arayüz kontrolleri gerekir. Windows imzasızdır ve EXE ile elle kurulur. Yalnızca manifestle doğrulanan baytları yayımlayın; önceki paket ve besleme kayıtlarını koruyun.

Yerel iPhone kesinti düzeltmesi ayrı depodadır; bu masaüstü kurulumlarına dahil değildir. iPhone kurulumu veya App Store yayını yapılmış sayılmaz.

## Açık fiziksel kabul

Gerçek Mac/Windows ses panosu öz dinleme, ekran/konuşma ses düzeyi ayrımı, kendi görüntüsünü kapatma, arka plan görüşmesi, gerçek üye bahsetmeleri/ortak liste tekrarı ve uzun IPTV/DJ aktarımı açıktır. Fiziksel iPhone görüşme/Instagram dönüşü ayrıca açıktır. Sentetik çözme, örnek arayüzler, derlemeler ve paket kontrolleri bunların yerine geçmez. Tam Spotify liste yetkilendirmesi/içe aktarımı, kapalı iPhone APNs, eşzamanlı şarkı sözleri ve daha fazla birlikte izleme sağlayıcısı ertelenmiştir.
