# Mimari

[← README](../README.md) · [Geliştirme](DEVELOPMENT.md) · [Sunucu kurulumu](SELF_HOSTING.md)

## İçindekiler

- [Süreçler ve güven sınırları](#süreçler-ve-güven-sınırları)
- [Hesap ve medya akışı](#hesap-ve-medya-akışı)
- [Durum ve kalıcılık](#durum-ve-kalıcılık)
- [Değişiklik sınırları](#değişiklik-sınırları)

## Süreçler ve güven sınırları

Tayfa, tek bir Electron/React masaüstü kabuğu ve ayrı servis yetkilerinden oluşur.

Görünüm süreci tipli preload köprüsünü kullanır. Yerel oturum saklama, dosyalar/yakalama, sağlayıcı kimlik bilgileri ve ağ yetenekleri Electron main'e aittir. Görünüm sürecinde Node entegrasyonu kapalıdır. IPC; güvenilir göndereni, pencereyi, çerçeveyi, kaynak adresini ve girdiyi doğrular. Yerel kimlik doğrulama seçilen sunucu ve hesapla sınırlıdır.

Sosyal alan tipleri ve Stoat bağdaştırıcısı, resmî üst sistem API/olaylarını ortak sözleşmeye dönüştürür. Arayüz özelliği için sosyal arka uç çatallanmaz. Eski Spacebar bağdaştırıcısı bir uyumluluk modülüdür; etkin kurulum yolu değildir.

Ses/medya durumu sayfa bileşenlerinin dışında yaşar. LiveKit medya sağlayıcısı sınırının arkasındadır; sayfa değiştirmek veya DJ panelini kapatmak görüşmeyi ya da sunucu kuyruğunu durdurmamalıdır. Katılımcı ses seviyesi dinleyiciye özeldir. Ortak etkinlikler yetkili komutlar, sürümler ve kullanıcıya özel görünümler kullanır; gizli oyun durumu diğer kullanıcılara gönderilmez.

Erişim servisi güncel kimliği/üyeliği doğrular ve süreli medya izinleri verir. Davet bağlantılarını da o yönetir: Stoat'un davet etme izni olan her üye bağlantı oluşturur, yalnız topluluk sahibi listeler ve iptal eder, defterde yalnız token'ın SHA-256 özeti durur ve çok kullanımlık bağlantıda her kayıt için üst sistemde yeni bir tek kullanımlık hesap daveti eklenir. `/davet/<token>` sayfası betiksiz, salt okunurdur (sıkı CSP, `no-store`, `no-referrer`, `noindex`) ve kullanım harcamaz. Activities sıralı oda durumu ile uyumlu kalıcılığı yönetir. Müzik çalışanı sınırlı kuyruk/kaynak temizliğini yönetir ve kısa süreli kira ile yayın yapar. İsteğe bağlı Agent, ayrı Linux sunucusunda Docker ile veya aynı fiziksel sunucuda ayrı kullanıcı ve sıkı kaynak sınırlarıyla rootless Podman üzerinden çalışır. Kurulum yolları ve yetkileri ayrı tutulur.

Topluluk görselleri dekoratif, sürümlü, boyutu sınırlı ve aynı kaynaktandır. Yükleme başarısızsa paketli özgün statik görsel kullanılır. Görsel istekleri hesap çerezi veya sağlayıcı belirteci göndermez ve müzik komut sözleşmesini değiştirmez.

## Hesap ve medya akışı

1. Kullanıcı **Giriş yap** sekmesinde topluluk kaynak adresini seçer ya da **Kayıt ol** sekmesine davet bağlantısı verir; yeni hesapta sunucuyu bağlantı belirler.
2. Electron'ın yerel sosyal sınırı o toplulukta oturum açar; kimlik bilgilerini görünüm süreci dışında tutar.
3. Tipli bağdaştırıcı, üst sistem REST/olaylarını uygulamanın sosyal alanına eşler.
4. Seste erişim servisi gerçek hesabı, kanalı, üyeliği ve izinleri kontrol edip kısa süreli LiveKit yetkisi verir.
5. İstemci LiveKit'e bağlanır. Cihaz yayını, ilgili açık kullanıcı işlemi ve izin akışından sonra başlar.
6. Activities komutları ayrıca yetkilendirir ve kullanıcıya özel görünüm döndürür. İsteğe bağlı müzik ve Agent servislerinin kendi yetkileri ve yaşam döngüleri vardır.

Bunlar farklı sistemlerdir. Sosyal websocket'in çalışması medyanın erişilebilir olduğunu kanıtlamaz; etkinlik sayfasının görünmesi o servisi kurmaz. Rotalar, portlar ve gerçek kurulum sırası [sunucu rehberindedir](SELF_HOSTING.md).

## Durum ve kalıcılık

| Durum | Sorumlu bileşen |
| --- | --- |
| Hesap, mesajlar ve sosyal üyelik | Stoat, veritabanı ve nesne deposu |
| Yerel hesap/oturum ve yerel tercihler | Seçilen masaüstü profili ve yerel kimlik bilgisi sınırı |
| Aktif medya oturumu | Sayfalardan bağımsız gerçek zamanlı istemci durumu, LiveKit ve erişim izinleri |
| Davet bağlantıları ve kullanımları | Erişim servisinin kalıcı defteri (`ROOMS_REGISTRATION_INVITES_FILE`, sürüm 2) ve üst sistem hesap oluşturma |
| Etkinlik/oyun durumu | Dosya veya PostgreSQL kullanan tek yetkili Activities süreci |
| Müzik kuyruğu/kaynak yaşam döngüsü | İsteğe bağlı müzik servisi; dinleyici ses seviyesi yereldir |
| Topluluk Sineması hesabı, kataloğu ve aktarımları | İsteğe bağlı sinema servisi; hesap ve katalog şifreli, aktarım yalnızca bellekte ([Topluluk Sineması](COMMUNITY_CINEMA.md)) |
| RMDB: salonun izleme kaydı, puan, yorum ve günlük | Sinema servisi `/state/rmdb`; IPTV hesabından ayrı şifreli dosya ve afiş kopyaları, hesap kaldırılınca da kalır ([RMDB](COMMUNITY_CINEMA.md#rmdb)) |
| Kişisel giriş ve çıkış sesleri | Erişim servisi `/state/personal-sounds`; seçim LiveKit iznine sunucu özelliği olarak eklenir, çalma dinleyicide yereldir ([Giriş sesi](PERSONAL_SOUNDS.md)) |
| Agent görevleri/izinleri/şifreli yapılandırma | İsteğe bağlı yalıtılmış Agent servisi |

Kaynak kod kopyası veritabanı yedeği değildir. Her kalıcı depoyu uyumlu yapılandırma ve şifreleme anahtarlarıyla yedekle; sürüm yükseltmeden geri yüklemeyi doğrula. Aktarım şifrelemesi E2EE değildir; uçtan uca şifreleme yapılandırılmamıştır.

## Değişiklik sınırları

Çalışma ortamları arasındaki işlemleri değiştirirken şemaları birlikte güncelle. Hesap nesillerini, eski yanıtların engellenmesini, izin iptalini, açık kullanıcı onayını ve kapanış temizliğini koru. Yalnızca klasör simetrisi için her şeyi taşımak yerine küçük, kendi içinde tutarlı özellik modüllerini tercih et. Kök takma adlarının tek kaynağı `tsconfig.json` dosyasıdır.

Kaynak açık bir geliştirme projesi olarak paylaşılabilir; bu, her özelliğin üretim için sertifikalandığı iddiası değildir. İmza, sağlayıcı erişimi, fiziksel cihaz kabulü ve sunucu kurtarma için ayrı kanıt gerekir.
