# Katkıda bulunma

Önce [geliştirme rehberini](docs/DEVELOPMENT.md) ve [mimariyi](docs/ARCHITECTURE.md) oku. Kendi hesabını ve ayrı bir `ROOMS_PROFILE` kullan; servis değişikliği gerektiriyorsa izole bir arka uç hazırla. İstemciye katkı vermek için üretim kimlik bilgileri veya Apple Developer üyeliği gerekmez.

1. Değişiklikten önce gözlenen sorunu veya hedeflenen kullanıcı akışını açıkla.
2. Kapsamı sınırlı tut; davranış değişikliğini geniş biçimlendirme işlemlerinden ayır.
3. Çalışma ortamları arasındaki bir sınırı değiştirirken tipli sözleşmeyi ve ilgili doğrulamayı birlikte güncelle.
4. İlgili regresyon kontrollerini ve normal lint, tip, test ve derleme kontrollerini çalıştır. Platform, sağlayıcı ve cihaz sınırlarını belirt.
5. PR'da sorunu, oluşan davranışı, doğrulamayı ve yapılandırma/veri geçişi etkisini anlat.

Sayfa geçişlerinden bağımsız sesi, yerel kimlik bilgisi saklamasını, güncel yetki kontrollerini ve hesap/kanal değişimindeki geçersizleştirmeyi koru. Üretime sentetik veri geri getirme veya başarılı sonuç üretmek için testleri zayıflatma. Geliştirme amacıyla başkasının topluluğuna erişme veya işleyişini bozma.

Tutarlı biçimlendirme için `pnpm format` kullan. Mantıksal paketler şu anda kökteki tek araç zincirini ve TypeScript alias haritasını paylaşır. Bağımsız olarak uygulanan veya yayımlanan bir sınır gerçekten gerektirmedikçe ayrı workspace manifesti ekleme.

Resmî sürümler ayrıca incelenir ve imzalanır. PR'a Keychain dışa aktarımı, özel SSH/imza anahtarı, sağlayıcı oturumu veya üretim ortam dosyası ekleme. Derleme kontrolü olarak `release:mac:publish` çalıştırma. Güvenlik sorunlarında [SECURITY.md](SECURITY.md) yolunu izle.
