# HostOps dağıtım kiti

HostOps isteğe bağlıdır. Core, Agent, hesaplar ve yayın arşivlerini değiştirmez. Aşamaları ayrı dağıtın; kabul koşulları geçmeden terminal/Agent kullanılabilirliğini ilan etmeyin.

## Servis

`pnpm services:build` ile derleyin. `dist-services/hostops.cjs` dosyasını Core dışında, root'a ait uygulama olarak, ayrı yetkisiz `rooms-ops` Linux kimliğiyle kurun. Yerleşik SQLite için Node 22.13+ veya Node 24 kullanın. `/var/lib/rooms-hostops` bu kimliğe ait, 0700 olsun. Servis ayarı root:rooms-ops 0640; üst dizin, yardımcı, ikili ve birimler root'a ait ve grup/diğer yazmasına kapalı olmalıdır.

`config.example.json` dosyasını özel `/etc/rooms-hostops/service.json` yoluna kopyalayın; gerçek topluluk kimliği/özel Stoat adresini seçin, Git'e koymayın. Yerel arayüze bağlayın. Yalnız `/rooms-ops/v1/*` ve sağlık yolunu önek kaldırma, TLS ve WebSocket desteğiyle localhost:3042'ye iletin. `/internal/*` iletilmez. Üst REST okuma sınırlarına takılmamak için `socialReadMongoUrl` üzerinde channels/servers/server_members için mevcut yalnız `find` rolünü kullanın; kimlik doğrulama üst REST'te kalır. Bu bilgi yalnız HostOps'ta olur; Agent/görünüme geçmez. Açık bağımsız yönetim portu, URL'de belirteç veya Authorization başlığı günlüğü olmaz. Mevcut sosyal oturum her isteği doğrular; yalnız güncel topluluk sahibi veya açık yetkili işletmeci sunucuyu görür. Akış açıkken üyelik/yetki yeniden denetlenir. Uygulama uyarısı kullanıcı bazında ayrıca onaylanır; teslim hatası bekler.

Terminal profili olmadan ve `agentAvailable:false` ile başlayın. İzleme masaüstünde hesap sırrı, Docker soketi veya ayrıcalıklı kabuk gerektirmez. İsteğe bağlı durum ölçümleri root:root 0755 `/usr/local/libexec/rooms-status-helper` olarak kurulan `rooms-status-helper.py` ve root sahipliğinde 0640 `status.json` kullanır. Tam konteyner adlarını ve okunur etiketleri izin listesine alın. Yalnız sağlık/yeniden başlatma sayısı ve isteğe bağlı doğrulanmış yedek kaydı döner; ortam, bağlar, günlükler veya sağlayıcı bilgileri dönmez. Eksik yedek bilinmiyor kalır. Yedek işi ancak başarılı doğrulamadan sonra `{ "verified": true, "completedAt": <epoch milliseconds> }` kaydı yazar.

## Kalıcı insan terminalleri

Tmux, sudo, Python 3 ve ayrı yerel kiti (`package.json` ve kilit dosyası) `/opt/rooms-hostops/native` altına kurun. node-pty için normal paket yöneticisi bağımlılık derleme onayını kullanın; onay politikasını kapatmayın. node-pty masaüstü paketine girmez.

`rooms-terminal-helper.py` dosyasını root:root 0755 `/usr/local/libexec/rooms-terminal-helper`, `profiles.example.json` dosyasını özel root:root 0640 `/etc/rooms-hostops/profiles.json` olarak kurun. Her işletmecinin ayrı Linux kullanıcısı/profili ve yazılabilir alanı olmalıdır. Core/müzik UID'si, Docker grubu, root, servis hesabı veya özel ayar dizinini kullanmayın. Terminal yapılandırılmış Linux kullanıcısının yetkisini verir; rastgele root konsolu değildir. Açık oturum paylaşımı aynı yetkiyi devreder.

`rooms-host-terminal@.service` şablonunu kurun. Bağımsız tmux sunucusu aracı yeniden başlatılsa da sürer. İşletmeci başına root sahipliğinde ek ayarla `ReadWritePaths` verin; örnek yalnız `/srv/rooms-operator` yoluna izin verir. Root yardımcı yalnız profilin ayarlı birimini başlatır; tüm ek grupları kaldırıp bağlanmadan UID/GID değiştirir. Çağıran komut/yol/ortam veremez. Kullanıcıları sudoers ve Core dosya gruplarından uzak tutun; çalışma alanları 0700 olsun. Bu insan sunucu kabuğudur; AI bu yol/profili alamaz.

Sudoers örneğini `visudo -cf` ile doğrulayıp kurun; rooms-ops için yalnız iki yardımcı yoluna sudo verilir. `ProtectSystem`/`ProtectHome` kalıcı tmux'a bağımsız uygulanır. Aracının PrivateTmp/cgroup yeniden başlatması ayrı sunucuları öldüremez. Sistem yeniden açılışı oturumu keser, komutları tekrarlamaz. Panel kapanması ayırır; açık sonlandırma öldürür. Ayrılmış oturum aracı çalışırken 24 saatte, yeniden başlatılmışsa ilk erişimde sona erer. Tekrar çıktısı RAM'de, tmux ekran geçmişi sınırlıdır; metin dosyası tutulmaz.

Özel ayarda `helper`, `nativeModules`, ayrı `terminalProfiles` ve sahip profilini tanımlayın. Aracı profilleri doğrular; işletmeci API'si Linux kullanıcısı oluşturamaz. Yetki vermeden TLS vekili ayarlayın. İşletmeci başına en fazla üç oturum; tam tek yazıcı, açık salt okunur/kontrol paylaşımı, artan girdi sırası, sınırlı çıktı/geri basınç vardır. Hesap/yetki kaybı yeni girdiyi durdurup akışları ayırır.

## Kabul ve geri dönüş

Açmadan önce birim/sudoers doğrulaması, gerçek Linux ölçümü, PTY Unicode/boyut, panel kapatıp bağlanma, yalnız HostOps yeniden başlatılınca aynı kabuğa dönme, yetki iptali ve Core dosya/ağ ayrıcalığı yokluğu sınanmalıdır. Ses/DJ açıkken CPU/RAM izleyin. Normal üye reddi ve masaüstü hesap değiştirmeyi sınayın. Taklit sürücüler kalıcı Linux kabulü sayılmaz.

Geri dönüş için ters vekil yolunu kaldırıp HostOps'u durdurun; önce işletmeci yetkilerini geri alın. Açıkça oluşturulan kalıcı terminal birimlerini ayrı listeleyip kapatın; ilgisiz tmux/Core süreçlerini durdurmayın. Ölçüm/yapılandırma yedeğini izinleri koruyarak özel tutun. Kit otomatik istemci güncellemesi/yayını yapmaz.

Ortak sunucuda rootless Agent ve onaylı yerel masaüstü kontrolünün [ayrı kabul koşulları](../../docs/SERVER_OPERATIONS.md) vardır; bu yardımcılar bunları uygulamaz veya yetkilendirmez.
