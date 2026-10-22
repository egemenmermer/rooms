# RC31 — Kulaklık, DJ ve denetim düzeltmeleri

RC30 yayımlanmadı; içeriği de bu sürümde. Sinema'daki Stremio ve tam denetim düzeltmeleri için [RC30 notlarına](RC30_RELEASE.md) bak.

## Ses

- **Kulaklık gidince oda açılmıyordu:** AirPods ya da başka bir kulaklık seçilip sonra ayrıldığında her katılım "Seçili cihaz bulunamadı" diyerek düşüyordu. Artık o sırada sistem varsayılanı kullanılıyor. Seçimin kayıtlı kalıyor; kulaklık geri bağlanınca uygulama kendiliğinden ona dönüyor.
- **Hoparlör görüşme ortasında giderse** mikrofon yine açılabiliyor.
- **Video kutucuğu:** Oda yeniden bağlanırken bekliyor, bağlantı dönünce kendiliğinden geri geliyor. Hata olursa "Yeniden dene" çıkıyor.

## DJ

- **Müzik rastgele kesiliyordu:** Erişim servisi bir an cevap vermeyince DJ oturumu kuyruğuyla birlikte siliniyordu. Artık yalnızca gerçek bir ret oturumu bitiriyor.
- **Bulunamayan şarkıda durmuyor:** "Sonraki", yeni eklenen liste ve otomatik geçiş YouTube'da bulunamayan şarkıyı atlıyor. Kuyrukta şarkının yanında "bulunamadı, atlandı" yazıyor. Art arda 10 bulunamayan şarkıya kadar devam ediyor.
- **Daha çok şarkı bulunuyor:** Kendi çalan listede tam eşleşme çıkmazsa "feat." ve "Remaster" gibi ekler atılıp ana sanatçı ve süreyle yeniden aranıyor. Cover, remix, canlı kayıt ve karaoke sürümleri yine çalınmıyor.
- **iPhone:** DJ paneli atlanan parçayı ve DJ'in neden durduğunu gösteriyor.

## Diğer

- **Sunucu uyarıları:** Disk, işlemci, yedek ve servis uyarıları sahibe ve geliştirici rolündeki yöneticilere sistem bildirimi olarak geliyor. Sunucu makinesi sekmesinin açık olması gerekmiyor.
- **Sunucu makinesi:** Yönetici rolünü kaybeden kişinin terminalleri ve paylaşımları kapanıyor.
- **Asistan geçmişi:** Her denetim işleminin Türkçe adı var.
- **Sinema:** Program hatırlatıcısı kendi topluluğunun salonunu açıyor.
- **Hesap ve profil:** Ayarlar sunucudaki biyografi, durum yazısı ve çevrimiçi durumla açılıyor. Boşaltılan alanlar sunucuda da siliniyor.
- **Davet:** Zaten hesabı olan bir e-postayla kayıt denenince davetin bir hakkı boşa gitmiyor; "Bu e-posta adresiyle zaten bir hesap var" yazıyor.

## Paketler ve doğrulama

Mac paketi imzalanıp noter onayı alır ve yayından önce bu Mac'te açılarak denenir. Windows paketi aynı commit'ten derlenir. Sunucuda RC30'un servis güncellemelerine ek olarak access, music, hostops ve agent servisleri bu sürümle güncellenir.

İki fiziksel istemcide gerçek AirPods ile katılım ve canlı DJ'de gerçek YouTube araması ayrıca denenir.
