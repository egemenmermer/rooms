# Açık kaynak yayın hazırlığı: tarihsel kontrol noktası

Bu belge 14 Ekim 2026'da RC8 deneme kaynağı (`59dee89`) ve o tarihte commit edilmiş DJ tamamlama/arama/sarma çalışmasından hazırlanan adayın kaydıdır. Sahibi MIT seçti. Aday o tarihte özel tutuluyordu; canlı ürüne kurulmamış, dağıtılmamış, birleştirilmemiş veya yayın olarak sunulmamıştı. Depo sonradan sahibi tarafından herkese açıldı; güncel masaüstü yayını [RC12](RC12_RELEASE.md)'dir. Aşağıdaki kayıt güncel durumla karıştırılmamalıdır.

## Yapılanlar

- MIT lisansı; katkı, güvenlik, yayın, geliştirme ve kendi sunucunda kurulum belgeleri.
- Özgün statik ImageGen müzik karakteri. Özel topluluk posteri/klibi kaynakta veya derlemede yok. Sunucuya göre ad/poster/isteğe bağlı animasyon; sınırlı, aynı kaynaklı, kimlik bilgisi göndermeyen yükleme ve güvenli yedek.
- Müzik kimliği, kuyruk komutları, arama/sarma sözleşmeleri, ses kontrolleri ve aktarım yaşam döngüsü korundu. Katılımcı görünen adı işletmeci tarafından ayarlanabilir.
- Kişisel dağıtım varsayılanları, özel hazırlık kayıtları/görseller/referans paketleri, eski kişisel sunucu kurulum komutları ve tek seferlik yayın yükleme iş akışları ayrıldı. Özgün özel depo/geçmiş ve harici özel arşiv bunları korur.
- Varsayılan topluluk adresi boş; kayıtlı tercihler ve davetler çalışır. Çatallara özgü açık imza/güncelleme/besleme/dağıtım ayarları; normal imzalı paketleme artık örtük yayın yapmaz.
- TypeScript yapılandırmasından ortak takma ad haritası, ayrı commit'lerde tutarlı Prettier düzeni, bağımlılık bakımı ve sağlama toplamıyla sabitlenmiş kaynak gizli bilgi taraması.

## O tarihte doğrulananlar

- Bağımsız bağımlılık dizininde kilit dosyası değiştirilmeden kurulum.
- Tam yerel pakette 119 test dosyası / 801 test başarılı.
- Lint, tür kontrolü, görünüm/yerel modül derlemesi, 128 üretim bağımlılığı bildirimi ve tüm servis paketleri başarılı.
- Biçim ve yayın ağacı politikası başarılı.
- Açıkça test topluluğu seçildikten sonra hesapsız Electron ilk açılışı başarılı. Geçersiz davet yerel doğrulandı; gerçek davet tüketilmedi.
- Gerçek korumalı Electron örnek bileşeni 1440×900 ve 900×700 çekildi; üretilen statik görsel çözüldü, görünüm hatası yok; gerçek oda/hesap/medya kullanılmadı. Geçici kaynak ve profil kaldırıldı.
- Yalnızca kaynak Gitleaks taraması, geniş klasör istisnaları yerine tam örnek değer istisnalarıyla başarılı. Eski özel geçmiş ayrı yayın sınırıdır.

İlk kontroller, kaldırılan üretim varsayılanına bağlı iki eski birim beklentisini ve bir yerel modül varsayımını buldu. Açık topluluk seçimini sınayacak şekilde güncellendiler; boş sunucudan kurtarma güvenli biçimde reddeder. İkinci, 17 dosyalık biçim geçişi çıktıyı sabitledi. Son derleme eşzamanlı biçimleme sırasında üretilen çıktıdan değil, kararlı kaynaktan yeniden alındı.

Büyük parça ve bağımlılık yorum uyarıları görünür kaldı. Bu kontroller fiziksel Mac/Windows medya oturumu, sağlayıcı izni, uzaktan yük, kurtarma veya yeni imzalı yayın kabulü anlamına gelmez. Sunucu kimlik bilgileri, imza anahtarları, kullanıcı verisi ve canlı Hoppers/ROOMS servisleri değiştirilmedi.

## Geçmiş ve son inceleme sınırı

Yayın hedefi mevcut `egemenmermer/rooms` deposudur. Özgün geçmiş değişmeden özel arşivde tutulur; incelenen ayıklanmış geçmiş, kimlikleri değişmekle birlikte geliştirme commit'lerini ve grafiği korur. Dosya/yayın tabloları için [yayın incelemesine](publication/README.md) bakın. Eski taze anlık görüntü yetkili devam noktası değildir. Kaynak/geçmiş temizliği, GitHub'ın tuttuğu eski PR veya önbellek görünümlerinin silindiği anlamına gelmez. Görünürlük değişimi bu kayıtların kaldırıldığını kanıtlamaz; destek talebi sonuçlanmış gibi gösterilmemelidir.
