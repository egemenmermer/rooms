# RC12 — Birleşik masaüstü yayını

**15 Ekim 2026'da yayımlandı.** [ROOMS 0.1.18-rc.12](https://github.com/egemenmermer/rooms/releases/tag/v0.1.18-rc.12), son production rol çalışmasını, Şemsettin'in sağırlaştırma düzeltmesini ve yeni portal ikonunu bir araya getirir. Arkadaş test sürümüdür; açık fiziksel kabul koşulları aşağıdadır.

## Neler var?

- Yeni portal ikonu: Mac uygulama paketi, Dock ve Hakkında ekranı aynı kaynak görseli kullanır.
- Ayarlar → Üyeler ve roller → Roller: rol oluşturma, ad/renk düzenleme, silme ve üyeye rol atama.
- Kanka, Yayıncı ve Moderatör taslakları; 12 temel izin için devral/izin ver/reddet. Taslak seçimi kendiliğinden yetki vermez. Rol hiyerarşisi ve görünmeyen izin bitleri korunur.
- [Şemsettin'in #29 düzeltmesi](https://github.com/egemenmermer/rooms/pull/29): yan panel sağırlaştırma düğmesinin durum ikonu ve erişilebilirlik bilgisi.
- RC11'in ortak listeleri, bahsetmeleri, sohbet, ses/ekran ve sunucu yönetimi çalışmaları korunur.

Birleşik kaynak [PR #30](https://github.com/egemenmermer/rooms/pull/30) üzerinden normal birleştirmeyle main'e alındı. İki platformun paket kaynağı `c63c6e810e1caf91d2fa2893f9b8bc19741b5009`; main birleştirmesi `3cd9f6dcd8dd0b3dc4a389f9cda1f2eace8d2507` aynı kaynak ağacını taşır. Türkçe belge düzenlemesi bu paketlerden sonra yapılır; yayımlanmış paketler yeniden yazılmaz.

## İndirme ve güncelleme

| Platform | Paket | Güncelleme |
| --- | --- | --- |
| macOS 14+ / Apple Silicon | [DMG](https://github.com/egemenmermer/rooms/releases/download/v0.1.18-rc.12/ROOMS-0.1.18-rc.12-arm64.dmg) | Yapılandırılmış Sparkle kanalından uygulama içinde |
| Windows x64 | [EXE](https://github.com/egemenmermer/rooms/releases/download/v0.1.18-rc.12/ROOMS-0.1.18-rc.12-windows-x64-setup.exe) | Yeni EXE'yi indirip elle kurma |

Mac paketi Apple imzalı, noter onaylı ve damgalıdır. Windows paketi imzasız arkadaş testidir; işletim sistemi uyarı gösterebilir. Windows için otomatik güncelleyici yayımlanmadı. Kullanıcı hesabı topluluğun sunucusunda kalır; uygulama paketini indirmek yeni hesap oluşturmaz.

Sparkle beslemesi RC12'yi ve sürüme sabit GitHub ZIP adresini sunar. Eski RC11 uygulaması ayrı, boş profilde güncellemeyi sorguladı ve `available`, `0.1.18-rc.12` sonucunu verdi. ZIP'in Ed25519 imzası mevcut güncelleyici açık anahtarıyla doğrulandı. Bu kontrol yeni sürüm teklifini doğrular; sahibin çalışan uygulaması üzerinde indirme/kurulum/yeniden açma yapılmadı.

## Tamamlanan doğrulamalar

- Tam yerel doğrulama: **151 test dosyası / 946 test**, lint, tür kontrolü, masaüstü ve servis derlemeleri başarılı.
- [Kaynak ve yerel bileşen CI](https://github.com/egemenmermer/rooms/actions/runs/38803520292), [kaynak gizlilik kontrolü](https://github.com/egemenmermer/rooms/actions/runs/38803520196) ve [iki platform paket sınırı](https://github.com/egemenmermer/rooms/actions/runs/38803520165) başarılı.
- Mac noter sonucu Accepted; damgalama ve Gatekeeper başarılı. Ayrı hesapsız profilde açılış, 900/1440 genişlik, VLC yükleme, etkin olmayan yerel giriş ve onaysız komut reddi başarılı. Paket içindeki ikonlar kaynakla eşleşiyor.
- [Gerçek Windows kurulum işi](https://github.com/egemenmermer/rooms/actions/runs/38803605817): NSIS kurulumu, kurulu ASAR eşitliği, sentetik VLC videosu, yerel giriş reddi, açılış/ayar ekranları, Strong/Standard model yükleme ve ayrı profil yeniden açılışı başarılı.
- Sekiz GitHub yayın dosyasının boyutu ve SHA-256 özeti yerelde doğrulanan dosyayla aynı.
- GitHub ve mevcut topluluk güncelleme beslemeleri RC12 döndürüyor. Mac/Windows indirme adresleri ve boyutları doğrulandı. Davetli indirme portalı iki platformu gösteriyor; önceki sürümler korunuyor.

### Ana paketlerin SHA-256 özetleri

| Dosya | SHA-256 |
| --- | --- |
| `ROOMS-0.1.18-rc.12-arm64.dmg` | `37d54b656115d92c7e1fd2811a3e606f947cbad03f4b372e96769b3589a952dd` |
| `ROOMS-0.1.18-rc.12-arm64-mac.zip` | `3ea7f3460fef7650daf7a55c6542bb8662a2da00632f3699237240d28f58b5d8` |
| `ROOMS-0.1.18-rc.12-windows-x64-setup.exe` | `d822353a54e2623d021c1cea9dbc6c94a17d61a47de613e9abb5925236549883` |

Yerel bileşen kaynakları, lisans malzemeleri ve platform manifestleri aynı yayındadır. Özel hesap/işletmeci test kayıtları depoya eklenmez.

## Açık kabul ve kapsam

Gerçek toplulukta rol oluşturma/düzenleme/yeniden açma/atama; fiziksel Mac/Windows'ta ses, ekran paylaşımı ve uzaktan kontrol; uzun kişisel IPTV/DJ oynatımı; yapılandırılmış gerçek Agent görevi ve birlikte yük kabulü açık kalır. Barındırılan Windows ortamındaki sentetik kontrol, fiziksel ses aygıtı kabulü değildir. [RC11'in açık kabul listesi](RC11_RELEASE.md) de geçerlidir.

RC12 için arka uç servisi yeniden başlatılmadı; hesaplar ve eski yayın/geri dönüş dosyaları korundu. Bu masaüstü yayını iPhone'u güncellemez. iPhone portal ikonu ayrı mobil kaynakta hazırdır; mobil derleme ve dağıtım ayrı işlemdir. Bu sürüm tamamlanmış herkese açık V1 kabulü olarak sunulmaz.
