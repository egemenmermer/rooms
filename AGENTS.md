# ROOMS geliştirme talimatları

- Proje sahibiyle tercih ettiği dilde iletişim kur. Arayüz Türkçe ve İngilizcedir: metni Türkçe yaz, `t()` ile sar ve İngilizcesini kataloğa ekle (docs/I18N.md). README ve katkı belgeleri önce İngilizce, sonra Türkçe; diğer proje belgeleri Türkçe kalabilir. Kod, API adları ve kod yorumlarında İngilizceyi koru.
- Uygulamayı ve incelemeyi ana agent yürütür. Kullanıcının açık izni olmadan işi başka agentlara devretme.
- Mevcut Electron/React istemcisini, tipli Stoat adapterini, değiştirilebilir medya katmanını ve sayfa geçişlerinden bağımsız ses bağlantısını koru.
- Görünür her kontrol çalışmalı veya neden kullanılamadığını açıklamalı. Geliştirme örnekleri etiketli kalmalı ve üretim akışlarına girmemeli.
- Yetkili işlemler ve kalıcı kimlik bilgileri görünüm süreci dışında kalır. IPC gönderenini, kaynak/ağ izinlerini ve topluluk üyeliğini doğrula.
- Kişisel medya bağlantılarını özel tut. Sağlayıcı belirteci dağıtımı veya DRM aşma ekleme. Yeniden yayın yalnızca topluluk sahibinin Sinema'ya bağladığı sunucu IPTV hesabı için yapılır: yalnızca salon kanalını görebilen doğrulanmış üyelere aktarılır, sağlayıcı kimlik bilgisi sunucudan çıkmaz.
- Sınırlı kapsamlı düzeltmeleri ve anlamlı regresyon kontrollerini tercih et. Birim, taklit servis veya yerel açılış kontrollerini iki fiziksel istemcinin medya kabulüyle eş tutma.
- Kullanıcı ilgili işleme izin vermedikçe dağıtım, imzalama, yayınlama veya uzaktaki sistemi etkileyen test yapma.
- Üretilmiş sırları, hesap dosyalarını, özel varlıkları, imza anahtarlarını, veritabanı kopyalarını veya özel operasyon kanıtlarını commit etme.
- Davranışı değiştirmeden önce docs/ARCHITECTURE.md belgesini ve ilgili modülü oku. Yalnızca biçimlendirme yapan değişiklikleri işlevsel değişikliklerden ayrı tut.
