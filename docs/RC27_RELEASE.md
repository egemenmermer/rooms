# RC27 — Tayfa, Devam et ve takılmayan DJ

Arkadaş test sürümü. Uygulamanın adı artık **Tayfa**. Sinema'da Filmler ve Diziler kaldığınız yerden açılıyor; dizinin sıradaki bölümü ve yayın tarihi görünüyor. DJ şarkı ortasında kopunca durmuyor. Davet bağlantısını artık her üye oluşturabiliyor.

## Tayfa

- Görünen ad, logo ve metinler Tayfa oldu. Güncellemeler ve oturumlar bozulmasın diye uygulamanın iç kimliği (uygulama klasörü, anahtar zinciri kaydı, güncelleme kaynağı, paket dosya adları) eskisi gibi kaldı.
- Sinema'daki RMDB sekmesinin adı da **Tayfa** oldu.

## Filmler ve Diziler

- **Devam et:** Filmler ve Diziler'in en üstünde salonun yarım bıraktığı filmler ve bölümler duruyor. Kalın satırda yalnızca yapımın adı, altında `S1 B2 · Bölüm adı` yazıyor. Bölümü biten dizide sıradaki bölüm gösteriliyor. Karta sağ tıklayıp ya da basılı tutup **Listeden kaldır** dersen kart yalnızca senden kalkar; salon yapımı yeniden izleyince geri gelir.
- **Yakında:** Sıradaki bölüm henüz çıkmadıysa kartta `Yakında · 08.12.2026` yazar. 60 günden az kaldıysa yanında `49g` gibi bir rozet çıkar. Tarih, sağlayıcı veriyorsa oradan alınır; vermiyorsa ve topluluk sahibi Sinema ayarlarına TMDB anahtarı girdiyse TMDB'den gelir.
- **Sonraki bölüm:** Bölümün son dakikasında kumandası olan kişiye sağ altta **Sonraki bölüm** düğmesi çıkar. Sırada başka bir şey yoksa bölüm bitince sonraki kendiliğinden başlar.
- **Bölüm işaretleri:** Dizi sayfasında izlenen bölümler işaretli, yarım kalan bölümde ilerleme çubuğu var. Her bölümü **İzlendi** ya da **İzlenmedi** olarak işaretleyebilirsin; Devam et de buna göre güncellenir. Ayarlar → Sinema'daki "İzlenmemiş bölümleri bulanıklaştır" seçeneği spoiler'ları gizler.
- **IMDb ve Letterboxd:** Puanın yanında IMDb (film ve dizi) ve Letterboxd (yalnızca film) düğmeleri var. Sağlayıcı yapımın TMDB kimliğini vermiyorsa düğme soluk görünür ve nedenini söyler.
- **Görseller:** Biçimine uymayan afiş ve kareler kırpılmıyor; bulanık bir zemin üstünde bütün olarak gösteriliyor. Satırlarda ok düğmeleri var ve fareyle sürüklenerek kaydırılabiliyor.

## Oynatıcı

- **Yayın bilgisi:** Fare ekranın üstündeyken çözünürlük, fps ve gerçek bit hızı, canlı yayında da "canlıdan X sn geride" bilgisi görünüyor. Film açılınca bu bilgi 3 saniye ekranda kalıyor.
- **Pencere içinde pencere ve her zaman üstte:** Kontrollerde iki yeni düğme var. Ekrana sağ tıklayınca da aynı seçenekler ve tam ekran çıkıyor.
- **Diller:** Ayarlar → Sinema'dan varsayılan altyazı dilini seçebilirsin: Türkçe, İngilizce ya da Kapalı. Film Türkçeyse altyazı kapalı açılır. Topluluk sahibi filmlerin hangi sesle başlayacağını seçer: Türkçe dublaj ya da Orijinal.
- **Kısayollar:** `?` kısayol kartını açar. Tuşlar Ayarlar → Klavye → Sinema salonu'ndan değiştirilebilir. Bir tuş başka bir komutta kullanılıyorsa yeni komuta geçer ve uygulama bunu söyler.

## Canlı TV

- **Favoriler:** Kanalın yıldızına bas ya da kanala sağ tıkla. Favoriler kategorisi açıkken ↑/↓ yalnızca favoriler arasında gezer. Liste hesabına bağlı, sunucuda tutuluyor.
- **Hatırlatıcı:** Salondaki "Sıradaki" programın zil düğmesine ya da kanalın sağ tık menüsüne bas. Program başlayınca bildirim gelir; karttan **Salonda aç** ile kanalı açabilir, **Salona duyur** ile salon sohbetine yazabilirsin. Hatırlatma bu bilgisayarda saklanır ve uygulama açıkken çalışır.

## DJ

- **Şarkı ortasında kopma:** "YouTube'dan alınamadı" hatası çıkıp DJ'in durması düzeldi. Bağlantı koparsa şarkı kaldığı yerden yeniden açılır. Yine olmazsa uyarıyla sıradakine geçilir. Çalmayan bir şarkı da artık sırayı durdurmuyor.
- **Temizle:** Kuyruğun üstündeki **Temizle** düğmesi çalan şarkı dışında kuyruğu boşaltır. Onaylamak için ikinci kez basman gerekir.

## Davet ve kendi sunucun

- Davet bağlantısını artık her üye oluşturabiliyor. Listeleme ve iptal topluluk sahibinde kalıyor. Bir toplulukta aynı anda en fazla 50 bağlantı etkin olabilir.
- **Kendi sunucunu kur** sekmesi adım adım ilerleyen bir sihirbaz oldu.

## Paketler ve doğrulama

Mac için Apple Silicon/macOS 14+ imzalı ve noter onaylı paket, Windows x64 için imzasız arkadaş test paketi hazırlanır. Sunucuda sinema, müzik ve erişim servisleri güncellenir. iPhone bu sürümde değişmiyor; yeni sunucu alanları geriye uyumlu.

**Otomatik kontroller:** Birleşik dalda tip kontrolü, lint ve tam test paketi (1711 test) geçti. Yeni ekranlar tarayıcıda örnek veriyle denendi. Gerçek ffmpeg ile röle testi de geçti: film iki anahtar kare arasına sarılınca görüntü ile altyazı aynı zamanda kalıyor. Docker uçtan uca testleri bu sürüm için çalıştırılmadı.

**Açık kalanlar:**

- **İleri sarınca altyazı kayması:** Sunucu tarafında zamanlama doğru; istemcideki neden henüz bulunamadı. Gerçek bir filmde yeniden üretilmesi gerekiyor.
- **Gerçek sağlayıcıyla denenmesi gerekenler:** Devam et, sonraki bölüm, yayın tarihleri, IMDb/Letterboxd bağlantıları ve yayın bilgisi.
- **Gerçek kullanımda denenmesi gerekenler:** DJ'in kopan şarkıyı yeniden açması (uzun bir oturumda) ve rc.26'dan Tayfa'ya güncellenince oturumun açık kalması.
- **iPhone:** Devam et, favoriler ve bölüm işaretleri iPhone'a sonraki turda gelecek.
