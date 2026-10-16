# RC18 — Etkinliğe tek tıkla katıl, yerel sessiz göstergesi ve bas-konuş tuşu

Arkadaş test sürümü. RC17'deki yeni sinema ve isteğe bağlı yayın izleme korunur.

- Süren bir etkinliğe katılmak kolaylaştı: Etkinlikler penceresinde yalnızca tek bir "Katıl" düğmesi var (zaten içindeysen "Aç"). "Herkes adına bitir" uyarısı ve "Bitir ve etkinlik seç" adımı kalktı.
- Bağlı olduğun ses odasında bir etkinlik sürüyorsa soldaki listede odanın altında "Katıl" etiketiyle görünür; tıklayınca doğrudan açılır.
- Ortak oynatıcıyı (Birlikte izle, dosya oturumu, ekran) herkes adına yalnızca host bitirebilir. Uygulamada bitirme düğmesi yalnızca hosta görünür.
- DJ, Etkinlikler penceresinden kaldırıldı; üst çubuktaki DJ düğmesinden açılır.
- Birinin sesini kendinde 0'a indirdiğinde sol listede ve oda ekranında "Sesini kapattın, yalnızca sende" simgesi çıkar; o kişi için yeşil konuşma halkası yanmaz.
- Odadaki "Bas konuş açık" yazısı artık varsayılan tuş yerine seçtiğin tuşu gösterir.
- DJ: 100 parçadan uzun ya da okunamayan satırları olan Spotify listeleri artık tümden reddedilmez; kuyruğa sığan kısmı eklenir ve DJ paneli kaç parçanın eklendiğini, kaçının atlandığını gösterir. Müzik servisi güncellendikten sonra çalışır.
- iPhone (TestFlight): telefon araması bağlantıyı düşürürse arama bitince aynı odaya kendiliğinden geri bağlanır.
- Mac: uygulamadaki Güncelleme ve hakkında bölümünden kontrol et. Windows: yeni EXE'yi indirip kur; paket imzasız arkadaş testidir.
- Bu bir arkadaş test sürümüdür. Etkinliğe katılma, host bitirmesi ve arama sonrası yeniden bağlanma gerçek cihazlarla deneniyor.

## Paketler ve doğrulama

Mac için Apple Silicon/macOS 14+ imzalı ve noter onaylı paket; Windows x64 için imzasız arkadaş test paketi bu sürümün hedefidir. iPhone sürümü TestFlight üzerinden dağıtılır. Kaynak testleri ve yerel paket kontrolleri, fiziksel cihaz kabulü yerine geçmez. Etkinliği yalnızca hostun bitirebilmesi sunucuda, Activities servisi yeniden dağıtıldıktan sonra zorunlu olur. Spotify listesinin kısmen eklenmesi için müzik ve erişim servisleri bu sürümden sonra dağıtılmalıdır; eski istemciler yeni müzik yanıtını reddedebileceği için önce masaüstü sürümü yayılmalıdır. Kanal sohbet botu (@claude) ayrı bir sunucu servisidir ve bu pakete dahil değildir.
