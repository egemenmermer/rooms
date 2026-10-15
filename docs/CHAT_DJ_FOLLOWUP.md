# Sohbet ve DJ kontrolleri

Dar kenar çubuğunda metin ve ses kanalı oluşturma kontrolleri görünür. Kanal yönetimi üst sistemin güncel yetkilerini kullanır; metin kanalı oluşturulduğunda yeni konuşmaya geçilir. Özel mesaj oluşturmak, mevcut üst sistem DM yolu üzerinden bir arkadaş veya yetkili topluluk üyesi seçer.

Fotoğraf önizlemeleri yerel IPC üzerinden yüklenir: yetkili mesaj/ek sorgusu, yapılandırılmış aynı kaynaklı dosya servisi, MIME ve boyut sınırları, kanal ve hesap kontrolleri uygulanır. Görünüm süreci rastgele URL çekemez; görsel CSP'si genişletilmez. Fotoğraf tıklanınca büyür; hata durumunda yeniden deneme vardır.

DJ komutları UUID ile parça seçimini ve kuyruğun tamamını yeniden sıralamayı içerir. Sıralama çalan parçayı yeniden başlatmaz; eski veya yinelenmiş üyelik reddedilir. Sürüklemeye ek olarak klavyeyle taşıma kontrolleri bulunur. Bitmiş son parça sıfırdan başlar; bitmiş kuyruğa eklenen yeni kayıt çalmaya başlar.

Oda dinleme oturumları müzik servisinin özel veri biriminde eşzamanlı, atomik yazmalarla saklanır. Yalnızca herkese açık YouTube referansları tutulur; sağlayıcı kimlik bilgileri ve özel medya URL'leri arşivlenmez. Spotify/SoundCloud referansları da bu açık kayıtlara çözümlenir. Yetkili istemcilere yalnızca sınırlı üstveri ve çalındı göstergeleri verilir; okuma sonrasında erişim yeniden denetlenir. Oturum veya tek geçmiş parça geri yükleme, mevcut katılım ve DJ kontrol iznini gerektirir; kayıtları kuyruğa ekleyip seçileni başlatır. Saklama oda başına 30, toplam 200 oturumla sınırlıdır. Özellikten önceki oturumlar otomatik yeniden oluşturulamaz.

Sağlayıcı eşleştirmesi sanatçı, başlık, sürüm ve süre kontrollerini korur. Düz Topic üstverisinde konuk sanatçılar eksik olabilir: yedek eşleştirme ancak ana Topic sanatçısı/başlığı tam uyarsa, süre farkı en fazla iki saniyeyse ve tek açık aday varsa yapılır. Kısaltılmış klipler, yanlış sanatçılar ve belirsiz sonuçlar reddedilir. Hatalar üstveri eşleşmesi, sağlayıcı reddi, yükleme süresi, ses çözme, aktarım ve geçmiş kaydı olarak ayrılır.

## Dağıtım sınırı

Kaynak ve açık paketler topluluk adreslerini/yapılandırmasını, özel görselleri, hesap verisini, dinleme geçmişini, imzalama/özel anahtarları, özel doğrulama kayıtlarını ve gerçek kullanıcı ekran görüntülerini içeremez. Çalışma zamanı topluluk ayarları ve özel marka kaynak dışında kalır. Genel marka yedeği ve açık sunucu seçimi korunur. Kaynak ağacı/geçmiş yayın kontrolleri zorunludur; kaynak commit'i mevcut topluluk paketlerini, beslemesini ve hesaplarını değiştirmez. Açık ikili yayınından önce özel imzalama/güncelleme ayarları ayrıca incelenmelidir.

## Doğrulamanın sınırı

Kapsamlı otomatik testlerin ve yerel örnek/yerel modül kontrollerinin kayıtları işletmecide özel tutulur. Fiziksel cihaz kabulünü kapatmaz veya her sağlayıcı kaydını onaylamaz. Bu uygulama belgesi yayın yetkisi vermez.
