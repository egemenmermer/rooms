# Araç kategorileri

| Kategori            | Araçlar                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Geliştirme ve build | `dev.mjs`, `build-electron.mjs`, `build-services.mjs`, `build-notices.mjs`                                              |
| Yerel kurulum       | `stoat-setup.mjs`, `stoat-start.mjs`, `stoat-configure-media.mjs`, `livekit-setup.mjs`, `livekit-native.mjs`            |
| Sürüm               | `release-preflight.mjs`, `release-manifest.mjs`, `prepare-sparkle.mjs`, `package-signed-mac.mjs`, `publish-sparkle.mjs` |
| Doğrulama           | `verify-*` araçları ve belirli arayüz/gürültü testleri                                                                  |

Bir doğrulama aracını çalıştırmadan önce kapsamını oku. Native, hesap, sağlayıcı ve servis kontrollerinin ön koşulları farklıdır.

Geçmişteki kişisel sunucu kurulum/yeniden başlatma/kesinti araçları ve eski Spacebar komutları bu dağıtıma dahil değildir. Bir doğrulama komutu başkasının canlı odasını kendiliğinden hedeflememeli. Genel sürüm yayınlama işlemi, sahibin açık yapılandırmasını ve iznini gerektirir.
