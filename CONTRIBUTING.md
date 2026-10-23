# Contributing

**[Türkçe ↓](#katkıda-bulunma)**

Read the [development guide](docs/DEVELOPMENT.md) and the [architecture](docs/ARCHITECTURE.md) first (both in Turkish for now). Use your own account and a separate `ROOMS_PROFILE`; if the change needs services, set up an isolated backend. You do not need production credentials or an Apple Developer membership to contribute to the client.

1. Before changing anything, describe the problem you saw or the user flow you are aiming for.
2. Keep the scope narrow; keep behaviour changes apart from broad formatting changes.
3. When you change a boundary between runtimes, update the typed contract and its checks together.
4. Run the relevant regression checks and the usual lint, type, test and build checks. State platform, provider and device limits.
5. In the PR, describe the problem, the resulting behaviour, how you verified it, and any configuration or data migration impact.

Protect page-independent voice, native credential storage, current permission checks, and invalidation when the account or channel changes. Do not bring synthetic data back into production or weaken tests to get a passing result. Do not access or disrupt someone else's community for development.

Interface text is written in Turkish and translated to English through `t()`; add the English for every new message. See [docs/I18N.md](docs/I18N.md) for the rules and glossary.

Use `pnpm format` for consistent formatting. The logical packages currently share the root toolchain and the TypeScript alias map. Do not add a separate workspace manifest unless a boundary that is applied or published independently really needs it.

Official releases are reviewed and signed separately. Never add Keychain exports, private SSH or signing keys, provider sessions or production environment files to a PR. Do not run `release:mac:publish` as a build check. For security issues, follow [SECURITY.md](SECURITY.md).

---

## Katkıda bulunma

Önce [geliştirme rehberini](docs/DEVELOPMENT.md) ve [mimariyi](docs/ARCHITECTURE.md) oku. Kendi hesabını ve ayrı bir `ROOMS_PROFILE` kullan; servis değişikliği gerektiriyorsa izole bir arka uç hazırla. İstemciye katkı vermek için üretim kimlik bilgileri veya Apple Developer üyeliği gerekmez.

1. Değişiklikten önce gözlenen sorunu veya hedeflenen kullanıcı akışını açıkla.
2. Kapsamı sınırlı tut; davranış değişikliğini geniş biçimlendirme işlemlerinden ayır.
3. Çalışma ortamları arasındaki bir sınırı değiştirirken tipli sözleşmeyi ve ilgili doğrulamayı birlikte güncelle.
4. İlgili regresyon kontrollerini ve normal lint, tip, test ve derleme kontrollerini çalıştır. Platform, sağlayıcı ve cihaz sınırlarını belirt.
5. PR'da sorunu, oluşan davranışı, doğrulamayı ve yapılandırma/veri geçişi etkisini anlat.

Sayfa geçişlerinden bağımsız sesi, yerel kimlik bilgisi saklamasını, güncel yetki kontrollerini ve hesap/kanal değişimindeki geçersizleştirmeyi koru. Üretime sentetik veri geri getirme veya başarılı sonuç üretmek için testleri zayıflatma. Geliştirme amacıyla başkasının topluluğuna erişme veya işleyişini bozma.

Arayüz metinleri Türkçe yazılır ve `t()` ile İngilizceye çevrilir; her yeni mesajın İngilizcesini de ekle. Kurallar ve terim sözlüğü için [docs/I18N.md](docs/I18N.md) belgesine bak.

Tutarlı biçimlendirme için `pnpm format` kullan. Mantıksal paketler şu anda kökteki tek araç zincirini ve TypeScript alias haritasını paylaşır. Bağımsız olarak uygulanan veya yayımlanan bir sınır gerçekten gerektirmedikçe ayrı workspace manifesti ekleme.

Resmî sürümler ayrıca incelenir ve imzalanır. PR'a Keychain dışa aktarımı, özel SSH/imza anahtarı, sağlayıcı oturumu veya üretim ortam dosyası ekleme. Derleme kontrolü olarak `release:mac:publish` çalıştırma. Güvenlik sorunlarında [SECURITY.md](SECURITY.md) yolunu izle.
