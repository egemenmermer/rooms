# Güvenlik politikası

Proje aktif geliştirme aşamasındadır. Şüpheli güvenlik açıklarını [GitHub'ın özel güvenlik bildirimi](https://github.com/egemenmermer/rooms/security/advisories/new) üzerinden bildir. Bu kanal depoda etkindir.

Kimlik bilgilerini, kullanıcıların özel içeriklerini veya açığın kötüye kullanım ayrıntılarını herkese açık issue'larda paylaşma. Özel bildirimde etkilenen sürümü/commiti, etkiyi, güvenli ve küçük bir yeniden üretim örneğini ve uygun bir iletişim yolunu belirt.

Yalnızca kullanmaya yetkili olduğun sistem ve hesaplarda test yap. Üretimi etkileyen kesinti ve yük testleri ayrıca izin gerektirir. Başka bir operatörün imzalama, deploy veya sağlayıcı kimlik bilgilerini kullanma.

Renderer sandbox içinde çalışır; yetkili işlemler Electron main veya ilgili sunucu servisinde kalır. IPC gönderen doğrulamasını, şema kontrollerini, güncel üyelik kontrollerini, native şifreli kimlik bilgisi saklamasını ve yaşam döngüsü temizliğini koru. Kaynak incelemesi, tüm platform/sağlayıcı akışlarının kabul edildiği garantisini vermez.

Sunucu operatörüne karşı uçtan uca şifreleme iddiası yoktur. Kendi sunucusunu çalıştıran kişi TLS, güvenlik duvarı, korumalı yedekler, erişim kontrolü, saklama süreleri ve topluluğunun gizlilik açıklamalarından sorumludur.
