# Topluluğu özelleştirme

Herkese açık istemciyle gerçek kişiye ait klip paketlenmez. Varsayılan DJ karakteri özgün ve statik bir çizimdir; ağ isteği olmadan çalışır.

Bağlanılan sunucu `/rooms-branding/manifest.json` dosyasını sunabilir:

```json
{"version":1,"music":{"name":"Bizim topluluğun DJ'i","poster":"/rooms-branding/dj.png","animation":"/rooms-branding/dj.webm"}}
```

İki medya alanı da isteğe bağlıdır. Posterlerde PNG/WebP/JPEG/AVIF, animasyonda WebM/MP4 kabul edilir. Bütün yollar o topluluğun `/rooms-branding/` ön eki altında kalmalıdır. Haricî sunucu, kimlik bilgisi, üst dizine çıkma veya query içeren yollar reddedilir. HTTPS kullan; izole geliştirmede loopback HTTP kabul edilir.

Manifest ve dosyaları seçilen topluluk kaynak adresinden, masaüstü kaynak adresine izin veren CORS ile sun. Herkese açık dekoratif dosyalar için `Access-Control-Allow-Origin:*` yeterlidir. Bu kaynaklara özel bilgi veya erişim belirteci koyma. Yalnız sunmaya hakkın olan malzemeyi kullan. Bu bir operatör ayarıdır; keyfî istemci dosya yükleme alanı değildir.

Manifest 8 KiB, poster 4 MiB, animasyon 12 MiB ile sınırlıdır. Zaman aşımı uygulanır; yönlendirme, kimlik bilgisi ve referrer gönderimi yoktur. İstemci kısa ömürlü blob URL'leri üretir ve sıkı görsel/medya CSP'sini korur. Sunucu değişirse eski istekler iptal edilir; bileşen kapanınca URL'ler bırakılır. Yapılandırma eksik, geçersiz, çevrimdışı veya çözülemiyorsa varsayılan statik karakter kalır. İşletim sisteminin azaltılmış hareket tercihi özel animasyonu kapatır.

Ses katılımcısının adı için erişim servisinde `ROOMS_MUSIC_NAME` ayarla ve manifest adıyla tutarlı tut. Müzik kimlikleri, kiralar, oynatma komutları, kuyruk ve dinleyici ses seviyesi değişmez. Her topluluk kendi markasını bağımsız seçebilir.

Proje sahibine özel görseller kaynak ağacının dışında tutulur. Özel görseli canlıya koymak veya çalışan servisi değiştirmek ayrı bir operasyon adımıdır.
