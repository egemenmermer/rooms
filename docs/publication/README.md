# Mevcut ROOMS deposunun yayın incelemesi

İlk inceleme: 14 Ekim 2026. MIT lisanslı yayın hedefi **egemenmermer/rooms** deposudur. Özel arşiv yedektir; yerine geçen başka açık kaynak proje değildir. Bu belge o günkü geçmiş temizliğini kaydeder. Sonraki açık masaüstü yayınları için [RC12 notlarına](../RC12_RELEASE.md) bakın.

Sahibi daha sonra görünürlüğü kendisi herkese açtı. Saklanan eski görünüm koşulu tamamlanmış değildir: inceleme sırasındaki anonim üstveri sorgusu, kaldırılmış özel görseli eski commit'te hâlâ çözüyordu. O kontrol noktasında eski yayınlar ve Actions çıktıları kaldırılmıştı; bir eski PR açıklamasındaki işletmeci adresi silinip yeniden okundu. Bunlar eski referans/önbelleğin temizlendiğini kanıtlamaz. Sonradan Support talebi gönderme yetkisi verildi; fakat gönderim veya GitHub tarafından temizlik tamamlandığı doğrulanmış değildir. Açık paket koşulları [paket politikasındadır](PACKAGE_POLICY.md).

## Geçmişin korunması

Dondurulan inceleme, alınan PR birleştirme referansları dahil 240 erişilebilir commit, 25 etiket ve 50 yerel referansı kapsadı. 240 commit'in tamamı doğrulanmış yerel Git bundle ve bağımsız özel `rooms-private-archive` içinde değişmeden korunur. Arşiv GitHub dal/etiket referansları ve üç yedek çıktısının özetleri kontrol edildi. Açık geçmiş de 240 eşlenmiş commit içerir; budanan commit sıfırdır. Yazar adları, zamanlar ve ebeveyn ilişkileri korunur. Bakımcı e-postası GitHub noreply adresiyle değiştirilmiştir. Özgün/ayıklanmış commit kimlikleri zorunlu olarak farklıdır; tam eşleme özel arşivdedir.

485 eski özel/arşiv yolu çıkarılmıştır; her biri [dosya tablosunda](HISTORY_FILE_DISPOSITIONS.csv) listelenir. Özel topluluk PNG/WebM, işletmeci kayıtları, ekran/referans kanıtları ve iç plan arşivlerini kapsar. Bunlar yayın kapsamı dışına çıkarılan dosyalardır; 485 ayrı güvenlik açığı iddiası değildir. Korunan 13 kaynak yolunda bilinen özel sunucu/e-posta/dosya yolu değerleri değiştirildi. İncelenmiş 21 güvenli eski mühendislik belgesi/araç korundu. Dört eski görsel referansı özel ikililer yeniden dağıtılmadan korundu; eski başlık işleme sürer.

Hazırlanmış son uygulama/kaynak ağacı geçmiş ayıklamadan önce ve sonra bayt bazında aynıydı. Bu karşılaştırma sonrası son değişiklikler yayın belgesiydi. Electron/React istemci, Stoat bağdaştırıcısı, medya aktarımı, oyun kuralları ve servisler korundu.

## Eski yayın incelemesi

25 eski yayındaki 96 çıktı indirildi/incelendi: 8063147400 bayt. Her dosya GitHub'ın SHA-256/boyutuyla eşleşti. ZIP/DMG/Windows kurulum ASAR içerikleri statik incelendi; DMG salt okunur bağlandı, paketli uygulama çalıştırılmadı. Küçük metin kayıtları ve Agent arşivleri incelendi. Dört yayın PNG'si görüntülendi; genel hesapsız ayarlar gösteriyor, görünür kişisel hesap/sohbet içermiyordu.

54 çıktıda doğrudan görülen özel topluluk malzemesi veya bakımcı altyapı referansı vardı. Diğerleri gizli diye etiketlenmedi; açık sağlama toplamı/noter kimliği/teknik kayıt, genel ayar görseli ve işaretlenmemiş iki erken paket içerir. Her çıktının kararı [yayın tablosundadır](RELEASE_ASSET_DISPOSITIONS.csv). Eski paketli dağıtımlar kaynaktan ayrıldı; sürüm etiketleri ayıklama sonrası korundu.

O tarihte son çalışan RC8 ve geri dönüş RC7, özgün dosya adı/özet doğrulamasıyla özel saklandı. İlk arşivde sürümler arası aynı adlı iki üstveri çakışması bulundu, düzeltildi ve yeni özel arşivde yeniden doğrulandı. Hiçbir özgün yayın baytı değiştirilmedi. Diğer eski çıktılar tam özgün yayın üstverisi/envanteri korunduktan sonra bu deponun dağıtım yüzeyinden kaldırıldı. Yalnız kaynak alfa yeni imzalı kurulum gibi sunulmadı.

## Diğer GitHub yüzeyleri

PR açıklama/yorum/incelemeleri 43 üstveri adresinden alınıp tarandı; doğrulanmış sır bulunmadı. Günlük anında erişilebilir 111 Actions çalışması incelendi, 10,76 MB günlük metni sır bulgusu olmadan tarandı. Bu sınırlı otomatik kanıttır; tüm özel verinin algılayıcıyla tanınacağını kanıtlamaz. Özel kanıt kopyaları arşivlendi; eski yürütme çıktıları yayın dışına alındı. İki Windows çıktı arşivi indirmesi zaman aşımına uğradı, incelendi sayılmadı; karşılık gelen yayın kurulumları ayrı incelendi. Bir Linux yerel çıktı arşivinin kapsayıcı/üye özetleri kontrol edildi.

Özgün tüm referans taramasında 16 bulgu kaynak üzerinden sır olmayan değer olarak değerlendirildi. Ayıklanmış geçmişte üç algılayıcı eşleşmesi açık Sparkle doğrulama anahtarıdır; özel imza anahtarı değildir, sızıntı diye döndürülmedi/silinmedi. Üçüncü taraf lisansları, font bildirimleri ve yazar atıfları korundu.

## Doğrulama ve üretim sınırı

Önceki tam çalışma/kaynak adayı 119 dosyada 801 test, lint, tür, uygulama/servis derlemesi, biçim ve Mac ilk açılış kontrolünü geçti (GitHub 38553988545). Geçmiş ayıklaması güncel ağacı değiştirmedi. Bu denetimden yeni imzalı yayın, kurulum/fiziksel medya kabulü veya üretim dağıtımı sonucu çıkarılmaz.

O tarihteki salt okunur topluluk besleme kontrolü altı indirme adresinin hepsinin topluluk sunucusunda, hiçbirinin GitHub'da olmadığını gösterdi. Denetim topluluk sunucusunu, beslemeyi, kurulu uygulamaları, hesapları veya sunucudaki özel görselleri değiştirmedi. Sonraki yayınlar bu tarihsel durumu değiştirmiştir. Açık kaynak özgün üretilmiş statik DJ ve isteğe bağlı topluluk özelleştirmesi kullanır.

## Yayın kontrolleri ve açık koşul

1. GitHub'ın tuttuğu eski PR referansı, commit/diff önbelleği ve ekler ayrıca karara bağlanmalıdır. Dal/etiket değiştirmek GitHub temizliği garantisi değildir; yerel temizlik salt okunur PR referansını silemez. Özel hazırlanmış destek talebinin gönderildiği veya sonuçlandığı doğrulanmamıştır. Deponun açık olması bu koşulu kapatmaz.
2. Özel güvenlik açığı bildirimi açılıp API'den yeniden okundu. Main koruması GitHub Actions üzerinden güncel baseline, native-smoke ve source-only kontrollerini; PR ve çözülmüş konuşmaları ister, yöneticilere uygulanır, zorla push/silmeyi yasaklar. Kanıt yalnız belge değil tekrar okunmuş API durumuydu. Yayın incelemesi sırasında bağımlılık PR oluşturma geçici durduruldu; istenen sınırlar ayrıca yönetilmelidir. Erişilebilir geçmiş gizlilik kontrolü, eski checkout'tan çıkarılmış yolların geri gelmesini önler.
3. Sahibin bağımsız görünürlük kararı ve daha sonra destek talebi yetkisi, eski görünümün gerçekten kaldırıldığına dair kanıt yerine geçmez.

GitHub'ın [resmî açıklaması](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) eski referansların ayrı ele alınmasını anlatır.

## Son temizlik kaydı

25 eski yayın kaydı/96 çıktı depodan ayrılırken 25 ayıklanmış kod etiketi korundu. RC8/RC7 için 19 özel, özetle doğrulanmış kopya tutuldu. Geçici GitHub silme HTTP 502 hatası kaydedilip tekrarlandı; canlı topluluk dağıtımı değiştirilmedi. Son geçmiş kontrolü ilk nesne adı envanterinde olmayan alternatif özel ekran yolunu buldu. Her commit'in tam ağaç taraması bunu belirledi; tam dizin geçmiş temizliği alternatifleri de çözdü. Bulguyu gizlemek için kontrol kapatılmadı.

Diğer checkout'lar yerel çalışmayı koruyup ayıklanmış deponun yeni klonundan devam etmelidir. Eski geçmişi tekrar birleştirmeyin/push etmeyin. Özgün geliştirme geçmişi özel arşiv ve commit eşlemesindedir.

## Envanter kodlarını okuma

CSV alan adları, yollar, sürümler, baytlar, özetler ve karar kodları denetim kayıtlarıyla karşılaştırılabilmesi için korunur. Dosya tablosundaki açıklamalar Türkçedir.

| Kod | Anlamı |
| --- | --- |
| `exclude-path-history` | Yol geçmişten çıkarıldı |
| `redact-known-private-literals` | Bilinen özel değerler ayıklandı |
| `retain` | Korundu |
| `retain-historical-reference-without-artwork` | Özel görsel olmadan tarihsel referans korundu |
| `retain-historical-technical-content` | Tarihsel teknik içerik korundu |
| `maintainer-host` | Bakımcının sunucu referansı |
| `personal-filesystem` | Kişisel dosya sistemi yolu |
| `private-community-artwork` | Özel topluluk görseli |
| `private-community-name` | Özel topluluk adı |
| `private distribution archive or removed historical distribution; retain code tag` | Özel dağıtım arşivine alındı veya eski dağıtımdan kaldırıldı; kod etiketi korundu |
