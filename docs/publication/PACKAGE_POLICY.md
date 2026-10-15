# Açık paket sınırı

Paketleme varsayılanı `ROOMS_DISTRIBUTION_SCOPE=public` değeridir. Electron paketleme sonrası kancası, imzadan önce Mac ve Windows'ta gerçek uygulama ASAR'ını ve açılmış kaynak dosyalarını inceler. Özel görsel, hesap/oturum/geçmiş dışa aktarımı, imza anahtarı, gömülü altyapı IP URL'si, kişisel dosya yolu ve veri/yapılandırma dosyalarındaki kimlik bilgilerini reddeder. Hatalar içerik veya gizli değer yerine dosya yolunu bildirir.

İşletmeci, `ROOMS_PRIVATE_PUBLICATION_MARKERS_FILE` ile gösterilen harici JSON metin dizisinden ek alan adı/adres/hesap işaretleri verebilir. Dosyayı kaynak ve paket girdileri dışında tutun. Kaynak politikası aynı özel işaretleri kullanır; gerçek altyapı adreslerini açık engel listesine koymayın.

Yalnızca açıkça `ROOMS_DISTRIBUTION_SCOPE=community` seçilen paketler özel topluluk güncelleme ayarını içerebilir. Bunlar bu deponun açık yayınlarına değil işletmecinin özel dağıtımına/arşivine aittir. Açık paket, bilerek açık seçilmiş HTTPS güncelleme alan adı ve açık doğrulama anahtarını kullanabilir. Apple imza sertifikası yayıncıyı tanımlar; gizli değildir, güvenilir imza korunurken saklanamaz.

Tarama bir yayın koşuludur; olası her özel değerin bulunmadığını kanıtlamaz. Yayından önce son kurulum kaynaklarını, güncelleyici ayarını, manifestleri, ekran görüntülerini, arşiv üyelerini ve GitHub'a yüklenecek envanteri inceleyin. ASAR kontrolü tüm DMG/ZIP/EXE'yi, platform imzasını veya fiziksel cihaz işlevlerini onaylamaz.

Eski GitHub yayınları ve CI çıktıları gelecekteki paket kontrollerinden ayrıdır. Eski PR referansları ve önbellekteki commit/dosya görünümleri ayrıca ele alınmalıdır. Düzenlenebilir geçmiş ve güncel paket kontrolü başarılı diye bu kayıtların silindiğini söylemeyin.
