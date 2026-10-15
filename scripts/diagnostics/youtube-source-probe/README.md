# Sınırlı youtube-source tanısı

Üretim yerine geçmeyen, yayın çıktısı olmayan yalıtılmış tanı aracıdır. Yayımlanan `dev.lavalink.youtube:common:1.18.2` ve `dev.arbjerg:lavaplayer:2.2.7` kullanılır. `mvn package` ile derleyin; çalıştırılabilir JAR'a on bir karakterlik tek video kimliği verin. En fazla 150 PCM çerçevesi ister; üstveri 25, ses 30 saniyeyle sınırlıdır; yalnızca sınırlı tanı sonucu yazar. Sürece dışarıdan 70 saniyelik zaman aşımı uygulayın.

Yalnızca WEB istemcisi kayıtlıdır. Kimlik bilgisi, çerez çıkarma, OAuth başlatma, IP döndürme, alternatif istemciye geçme, uzak şifre çözme servisi veya odaya yayın yoktur. Bu sınırlı kontrol üst sistemin bütün varsayılan istemci listesinin davranışını kanıtlamaz. Sağlayıcı reddinden sonra kapsamı kendiliğinden genişletmeyin.

Tek kullanımlık, kök olmayan konteyner; salt okunur kök, kaldırılmış yetenekler, bellek/CPU/PID sınırları ve özel geçici dosya sistemi kullanın. Kaynak ses kaydedilmez veya hoparlörden çalınmaz. Üstveri tek başına başarı değildir; `PASS_PCM`, sessiz olmayan 150 PCM çerçevesi gerektirir. Bu da fiziksel oda kabulü değildir.

Üst projeler: [youtube-source](https://github.com/lavalink-devs/youtube-source) (MIT), [lavaplayer](https://github.com/lavalink-devs/lavaplayer) (Apache 2.0). Üst kaynak tanı aracına kopyalanmaz. Bağımlılıkları içeren yerel JAR bunların lisanslarını da taşır; normal bağımlılık/lisans incelemesi olmadan ürün olarak dağıtılmamalıdır.

## Açıkça istenen cihaz girişi hazırlığı

`rooms.DeviceLogin` ayrı, isteğe bağlı giriş noktasıdır. Sahip onayından sonra Google cihaz ekranını ister; bekleyen yanıtı 0600 izinle `/private/pending-device.json` yoluna yazar; mevcut isteğin üzerine yazmaz. Yalnızca kullanıcı doğrulama adresi/kodu ve süreyi gösterir. Belirteç için sorgulama yapmaz veya hesabı yetkilendirmez. Üst kapsam yalnızca ses oynatma değil geniş YouTube hesap izinleri içerir; bunu açıklayın, hesap seçimi ve Google onayını sahibine bırakın. Üst belirteç günlüğünü açmayın; cihaz sırrını/yenileme belirtecini yazdırmayın veya çıktılara kopyalamayın. Üretim bu bekleyen durumu kullanmaz.

## Ayrı hesap kaynak kontrolü

`rooms.OAuthSourceProbe VIDEO_ID` ayrıca onaylanan tanıdır. `/private` yoluna yalnızca ayrı hesabın özel dizinini bağlayın; bırakılmış ana hesap isteğini bağlamayın. Bekleyen cihaz isteğini bir kez değiştirir, yenileme belirtecini atomik taşıma ve 0600 izinle saklar; kimlik bilgilerini günlüğe yazmadan yeniler. Yalnızca üst OAuth destekli TV istemcisini kullanır. Bu istemci üstveri çekemediğinden yalnızca kimlikli parça tanımı kullanılır; yer tutucu başlık/süre doğrulanmış üstveri değildir. Araç 30 saniye/150 PCM çerçevesiyle sınırlıdır; dışarıdan ayrıca 65 saniye zaman aşımı gerekir. Odaya yayın yapmaz. Hatalar sınıflandırma ve Java sınıf/yöntem/satır adlarıyla sınırlıdır; ham yanıtlar ve istisna mesajları yazılmaz. SLF4J kapalı kalır.

13 Ekim 2026'da ayrı hesap yetkisi başarılı oldu; sahibinin seçtiği kaynak sağlayıcının oynatılabilirlik aşamasında sıfır PCM çerçevesiyle başarısız oldu. Başarılı giriş tek başına üretim değişimini veya yayını haklı çıkarmaz. Ayrıntılı kaynak kimliği ve sonuçlar işletmecinin özel tanı kayıtlarındadır.
