# Topluluk rolleri

Ayarlar → Üyeler ve roller → Roller bölümünde rol oluşturabilir, adını ve onaltılık rengini değiştirebilirsiniz. Görünüm ve izinler ayrı sekmelerde, ayrı kaydetme düğmeleriyle düzenlenir. Kanka, Yayıncı ve Moderatör düzenlenebilir taslak şablonlardır; kendiliğinden izin vermez veya üyeye atanmaz. Bir üye birden çok rol taşıyabilir.

Düzenleyici üst sistemin on iki iznini destekler: görüntüleme, mesaj gönderme, dosyalar, bağlanma, konuşma, video, mesaj yönetimi, kanal yönetimi, rol atama, rol yönetimi, izin yönetimi ve üye çıkarma. Her izin devral, izin ver veya reddet olabilir. Arayüzde gösterilmeyen izin bitleri korunur. Sunucu varsayılanları ve kanal istisnaları geçerliliğini sürdürür; yeni bir izin motoru kurulmaz.

Electron her değişiklik isteğini doğrular. Türlendirilmiş Stoat bağdaştırıcısı isteği üst API'ye göndermeden önce güncel üyeliği, rol hiyerarşisini ve verilebilecek izinleri okur. Görünüm, oluşturma ve silme `ManageRole`; izin değişiklikleri `ManagePermissions` gerektirir. Üst sunucu her yazmayı yeniden yetkilendirir. Kimlik bilgileri ana süreçte kalır. Yazma başarılı olup yenileme başarısız olursa ayrı hata gösterilir; yazma otomatik tekrarlanmaz.

Regresyon testleri sabitlenen API yüklerini, yüksek izin bitlerini, hiyerarşi ve yetki yükseltme reddini, IPC/güvenilir gönderici doğrulamasını, kaydetme hatalarını, kaydedilmemiş taslakları, şablonları ve kayıt sırasında ağ geçidi geçersizleştirmesini kapsar. İşaretli geliştirme görünümleri bir hesabı değiştiremez. Taklit testler ve yalıtılmış paket kontrolleri canlı çok kullanıcılı kabul yerine geçmez. Bu kabulü tamamlandı saymadan önce gerçek toplulukta oluşturma, düzenleme, yeniden açma ve üye atamasını doğrulayın.
