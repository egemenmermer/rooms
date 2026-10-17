# RC23 — Sinemada ses senkronu, sade salon ve tek komutla sunucu kurulumu

Arkadaş test sürümü. "bugs & features" kanalına RC22 sonrası yazılan sinema geri bildirimlerini ve kendi sunucunu açma kitini birlikte getirir.

## Sinema

- **Ses önden gitmiyor:** Film ve dizileri ortasından açınca ses, görüntünün birkaç saniye önüne geçiyordu. Sunucu artık ses ile görüntünün zamanlamasını parçaların içine yazıyor; Chromium'un yok saydığı "edit list" kullanılmıyor. Bu düzeltme sunucudaki sinema servisinde, uygulamayı güncellemeden de geçerli olur.
- **Rehber kalktı:** Rehber sekmesi, `G` kısayolu ve kanal listesindeki "Rehber yok" satırları kaldırıldı.
- **Canlı TV sadeleşti:** Kanallar logolu kutucuklar olarak dizilir, sağdaki ayrıntı sütunu yok. Bir kutucuğa tıklamak kanalı salonda açar; kumanda ev sahibindeyse sıraya önerir. Klavyede ok tuşları ve Enter çalışır.
- **YouTube, Filmler/Diziler gibi:** Büyük kapak alanına bağlantı yapıştırılır; video tanınınca kapak ve başlık görünür. Salonun YouTube sırası altta afiş satırı olarak durur.
- **Sohbet kompakt:** Salon sohbetinde yazı 13 px, avatarlar küçük, satırlar sık.
- **Sol menüdeki izleyen fotoğrafları** yuvarlak kalır ve çevrelerinde çerçeve görünmez.
- Sağlayıcının rehberi (XMLTV) bozuk ya da yoksa katalog içe aktarma artık başarısız sayılmaz.

## Kendi sunucunu kur

`deploy/` klasöründeki kurulum kiti main'e girdi. Bir Linux sunucuda tek komutla ROOMS sunucusu açılır; ayrıntılar [Kendi sunucunu kur](SELF_HOSTING.md) belgesinde. Müzik (DJ), Sinema salonu, Agent ve yönetim paneli hızlı kuruluma dahil değildir.

## Paketler ve doğrulama

Mac için Apple Silicon/macOS 14+ imzalı ve noter onaylı paket, Windows x64 için imzasız arkadaş test paketi hedeflenir. Sunucuda sinema servisi yeniden kurulur.

**Otomatik kontroller:** Tam test paketi, lint ve tip kontrolü geçti. Gerçek ffmpeg ile relay testleri geçti. Sentetik bir filmde ortadan başlatılan aktarımın parçaları incelendi: ses ile görüntü arasındaki fark 0 ms, edit list yok. Yeni Canlı TV ve YouTube düzeni tarayıcıda örnek veriyle görsel olarak kontrol edildi.

**Açık kalanlar:**
- Ses senkronu gerçek sağlayıcıyla ve iki fiziksel bilgisayarda denenmeli.
- Kurulum kiti yalnızca 16 Ekim'de bir OrbStack sanal makinesinde denendi (14/14). Güncel main üzerinde, gerçek bir VPS'te, alan adı ve Let's Encrypt sertifikasıyla henüz denenmedi.
