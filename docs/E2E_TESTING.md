# Uçtan uca test paketi

[← README](../README.md) · [Geliştirme](DEVELOPMENT.md) · [Mimari](ARCHITECTURE.md) · [Sunucu kurulumu](SELF_HOSTING.md)

Bu paket, **gerçek ROOMS masaüstü istemcilerini** (Electron main + görünüm süreci) yerel ve atılabilir bir ROOMS sunucusuna karşı çalıştırır. Her test, gerçek kullanıcı gibi pencerede tıklar, yazar ve sonucu hem arayüzde hem de üst sistemde doğrular. Sahte servis, örnek veri veya `?fixture` yolu kullanılmaz.

## İçindekiler

- [Ne kanıtlar, ne kanıtlamaz?](#ne-kanıtlar-ne-kanıtlamaz)
- [Hızlı başlangıç](#hızlı-başlangıç)
- [Klasör yapısı](#klasör-yapısı)
- [Yerel yığın](#yerel-yığın)
- [Bir test çalışmasının yaşam döngüsü](#bir-test-çalışmasının-yaşam-döngüsü)
- [Kapsam](#kapsam)
- [Bulunan hatalar](#bulunan-hatalar)
- [Yeni test yazmak](#yeni-test-yazmak)
- [Hata ayıklama](#hata-ayıklama)
- [Güvenlik kuralları](#güvenlik-kuralları)
- [Sorun giderme](#sorun-giderme)

## Ne kanıtlar, ne kanıtlamaz?

[Doğrulama seviyeleri](DEVELOPMENT.md#doğrulama-seviyeleri) içinde bu paket **3. seviyedir: servis entegrasyonu**. Birim testlerinden (1) ve tek pencereli açılış kontrolünden (2) farklı olarak şunları gerçek bileşenlerle sınar:

| Kanıtlanan | Nasıl |
| --- | --- |
| Gerçek Stoat hesabı, oturum, ağ geçidi olayları | Sabit `ghcr.io/stoatchat/*:v0.15.5` imajları, iki veya daha fazla ayrı Electron profili |
| Davetli kayıt ve tek kullanımlık bilet | Gerçek erişim servisi (`access.cjs`) ve kalıcı bilet defteri |
| Üyelik/izin sınırları | Topluluk dışı gerçek hesap; erişim ve Activities servislerinin 4xx yanıtları |
| Ses ve kamera aktarımı | Erişim servisinin LiveKit yetkisi, LiveKit v1.9.12 SFU, WebRTC `inbound-rtp` paket sayıları |
| Ortak etkinlik durumu | PostgreSQL kullanan gerçek Activities servisi; iki istemci arasında anket ve oy |
| Yerel tercihler ve oturum geri yükleme | Aynı profille uygulamayı kapatıp yeniden açma |

**Kanıtlamaz:**

- İki fiziksel bilgisayar arasında duyulan ses, gerçek mikrofon/kamera ve farklı ağlar (4. seviye). Mikrofon ve kamera Chromium'un sentetik cihazlarıdır (`--use-fake-device-for-media-stream`): bip sesi ve test deseni.
- Ekran paylaşımı. macOS Ekran Kaydı izni ve `desktopCapturer` gerekir; test bilerek atlanır.
- HTTPS/WSS, TLS, NAT/TURN ve gerçek sunucu kaynak sınırları. Yığın yalnız loopback HTTP kullanır.
- İmzalı paket, kurulum ve otomatik güncelleme. Testler `pnpm build` çıktısını `electron .` ile açar.
- YouTube, müzik/DJ, Agent, HostOps, uzaktan kontrol ve APNs. Bunlar HTTPS kaynağı, sağlayıcı hesabı veya ayrı servis ister; aşağıdaki [kapsam](#kapsam) tablosuna bak.

Bir PR'da sonuç bildirirken bu sınırları açıkça yaz. Bu paketin geçmesi üretim sunucusunun veya fiziksel cihaz kabulünün geçtiği anlamına gelmez.

## Hızlı başlangıç

Gerekenler: Node.js ve pnpm ([araç zinciri](DEVELOPMENT.md#araç-zinciri)), çalışan Docker Desktop veya eşdeğer Docker Engine, macOS ya da Linux masaüstü oturumu.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm e2e:stack up
pnpm e2e
```

- `pnpm e2e:stack up` servisleri derler, sırları ilk kez üretir, imajları indirir ve tüm servisler sağlıklı olana kadar bekler. İlk çalıştırma imaj indirme yüzünden birkaç dakika sürebilir; sonrakiler saniyeler içinde açılır.
- `pnpm e2e` her çalışmada yeni hesaplar ve yeni bir topluluk oluşturur; yığını sıfırlamak gerekmez.
- Kod değiştiyse `pnpm build` komutunu yeniden çalıştır. Servis kodu değiştiyse `pnpm e2e:stack up` yeniden derleyip konteynerleri tazeler.

Sık kullanılan komutlar:

| Komut | Amaç |
| --- | --- |
| `pnpm e2e` | Tüm paketi çalıştırır |
| `pnpm e2e specs/chat.spec.ts` | Tek dosya |
| `pnpm e2e --grep "voice"` | Başlığa göre süzme |
| `pnpm e2e:report` | Son HTML raporunu açar |
| `pnpm e2e:stack status` | Konteyner durumu ve sağlık yoklamaları |
| `pnpm e2e:stack logs access` | Bir servisin son günlükleri |
| `pnpm e2e:stack down` | Konteynerleri durdurur, veriyi korur |
| `pnpm e2e:stack reset` | Konteynerleri, birimleri, sırları ve çalışma dosyalarını siler |

Testler çalışırken ekranda ROOMS pencereleri açılıp kapanır. Bu normaldir; pencerelere tıklama. Her test kendi pencerelerini kapatır ve profil klasörlerini siler.

## Klasör yapısı

```text
tests/e2e/
├── playwright.config.ts      # Tek işçi, raporlar .local/e2e/ altında
├── stack/                    # Atılabilir yerel ROOMS sunucusu
│   ├── compose.yml           # Stoat, Caddy, access, activities, LiveKit, PostgreSQL
│   ├── Caddyfile.template    # Üretim vekiliyle aynı herkese açık rotalar
│   ├── Revolt.toml.template  # Stoat yapılandırması (sırlar ortam değişkeniyle gelir)
│   ├── livekit.yaml.template # LiveKit; anahtar ve webhook üretilir
│   └── stack.mjs             # up / status / logs / down / reset
├── support/
│   ├── env.ts                # Hedef adresler; yalnız 127.0.0.1 kabul edilir
│   ├── stoat-api.ts          # Düzenleme ve doğrulama için ham Stoat REST istemcisi
│   ├── seed.ts               # Hesap, topluluk, kanal, davet ve kayıt bileti üretimi
│   ├── global-setup.ts       # Derleme/yığın kontrolü ve çalışma başına tohumlama
│   ├── client.ts             # RoomsClient: bir Electron süreci + izole profil
│   ├── fixtures.ts           # Playwright fixture'ları: run, clients, owner, guest
│   └── pages/                # Sayfa nesneleri: chat.ts, voice.ts
└── specs/                    # Özellik bazlı testler

.local/e2e/                   # Git'in yok saydığı üretilmiş dosyalar
├── stack/                    # Sırlar (0600), işlenmiş yapılandırma, erişim servisi durumu
├── run.json                  # Son çalışmanın hesapları ve kimlikleri (0600)
├── test-results/             # Başarısız testlerin ekleri ve izleri
├── report/                   # HTML raporu
└── results.json              # Makine tarafından okunabilir sonuçlar
```

`tests/desktop/acceptance.spec.ts` ayrı kalır. CI'daki `native-smoke` işi onun oturumsuz kabuk testini çalıştırır; bu paket CI'da çalışmaz (Docker yığını ve ekranlı masaüstü ister).

## Yerel yığın

Yığın, [üretim düzenini](SELF_HOSTING.md) loopback üzerinde yeniden kurar. Compose proje adı `rooms-e2e`'dir; geliştirme Stoat kurulumuyla (`.local/stoat`, `rooms-stoat`) çakışmaz.

| Servis | İmaj | Rol |
| --- | --- | --- |
| `database`, `redis`, `rabbit`, `minio`, `createbuckets` | mongo:8, valkey 9, rabbitmq 4, pgsty/silo, pgsty/mc | Stoat altyapısı |
| `api`, `events`, `autumn`, `january` | `ghcr.io/stoatchat/*:v0.15.5` | Sabit, değiştirilmemiş Stoat |
| `caddy` | caddy:2 | Üretimdeki herkese açık rotalar; doğrudan hesap oluşturmayı 403 ile reddeder |
| `access` | node:22.22.0 + `dist-services/access.cjs` | Kayıt aracısı, üyelik ve medya yetkisi |
| `activities` + `postgres` | node:22.22.0 + `dist-services/activities.cjs`, postgres:17 | Yetkili etkinlik durumu |
| `livekit` | livekit/livekit-server:v1.9.12 | Üretimdeki sürümle aynı SFU |

Adresler (hepsi `127.0.0.1`):

| Port | Amaç |
| --- | --- |
| 4100 | Topluluk adresi `http://127.0.0.1:4100` (Caddy). İstemciye girilen adres budur. |
| 4101 | Ham Stoat API. Yalnız test düzenlemesi için; herkese açık vekil hesap oluşturmayı engeller. |
| 4102 | MongoDB. Hesap davetleri bu bağlantıyla eklenir. |
| 7880 | LiveKit sinyali. Görünüm sürecinin CSP'si yerel LiveKit'e yalnız bu porttan izin verir; bu yüzden aynı anda başka yerel LiveKit çalışamaz. |
| 4181/tcp, 51000–51020/udp | LiveKit medya. ICE adayları `127.0.0.1` olarak duyurulur. |

Sırlar (`RabbitMQ`, `MinIO`, `PostgreSQL`, LiveKit anahtarı, dosya şifreleme anahtarı, VAPID) ilk `up` sırasında rastgele üretilir, `.local/e2e/stack/` altında 0600 izinle saklanır ve hiçbir zaman yazdırılmaz. `reset` hepsini siler.

Kayıt üretimde olduğu gibi davetle sınırlıdır (`invite_only = true`). Test hesapları ham API'de, üst sistem hesap daveti MongoDB'ye eklenerek oluşturulur. Bu, yöneticinin [ilk hesap adımının](SELF_HOSTING.md#5-i̇lk-hesap-ve-davetler) yerel karşılığıdır. ROOMS kayıt bileti ise erişim servisinin kendi `issueRegistrationInvite` fonksiyonuyla üretilir; arayüzden kayıt testi bu bileti tüketir.

## Bir test çalışmasının yaşam döngüsü

1. **Ön kontrol** (`global-setup.ts`): hedefin loopback olduğu, `dist/` ve `dist-electron/` derlemesinin bulunduğu ve dört sağlık ucunun (Stoat API, access, activities, LiveKit) yanıt verdiği doğrulanır. Biri eksikse test başlamadan anlaşılır bir hata verilir.
2. **Tohumlama**: rastgele bir çalışma kimliğiyle (`runId`) üç hesap (`owner`, `guest`, `outsider`), `E2E <runId>` adlı topluluk, `General` metin kanalı, `Ses Odası` ses odası ve topluluk daveti oluşturulur. `guest` topluluğa katılır, `outsider` katılmaz. Sonuç `.local/e2e/run.json` dosyasına yazılır.
3. **Testler**: her test `owner`/`guest` fixture'larıyla veya `clients.launch()` ile kendi Electron süreçlerini açar. Her süreç ayrı `ROOMS_PROFILE` ve ayrı kullanıcı verisi klasörü alır; oturum, tercih ve önbellek paylaşılmaz.
4. **Temizlik**: test bitince her pencere kapanır ve profil klasörü silinir. Başarısız testte önce her pencerenin ekran görüntüsü, erişilebilirlik ağacı ve Playwright izi eklenir.

İlişki veya üyelik değiştiren testler (arkadaşlık, DM, profil, kayıt) `provisionAccount()` ile kendi hesaplarını oluşturur. Böylece testler sıradan bağımsızdır ve tek başına çalıştırılabilir.

## Kapsam

| Alan | Dosya | Doğrulanan davranış |
| --- | --- | --- |
| Oturum | `auth.spec.ts` | İlk giriş, profil adımı ve üst sistemde kaydedilen görünen ad; yanlış şifre; yeniden açılışta oturum; çıkış sonrası oturumun unutulması |
| Kayıt | `registration.spec.ts` | Biletle hesap oluşturup topluluğa düşme; kullanılmış biletin reddi ve defter durumu; vekilin doğrudan hesap oluşturmayı reddetmesi |
| Sohbet | `chat.spec.ts` | İki yönlü canlı mesaj; düzenle/sil yayılımı; başkasının mesajını silememe; reaksiyonlar (bilinen hata); yeniden açılışta geçmiş |
| Kanallar | `channels.spec.ts` | Sahibin oluşturduğu metin/ses kanallarının üyeye canlı düşmesi; üst sistemde ses yeteneği; menüden yeniden adlandırma ve silme; üyeye yetki açıklaması |
| Arkadaşlar ve DM | `friends-dm.spec.ts` | `ad#1234` ile istek, kabul, özel mesaj alışverişi; arkadaş olmayana kuralın açıklanması |
| Erişim | `access-control.spec.ts` | Topluluk dışı hesabın odaları görmemesi; medya/etkinlik servislerinin üye olmayanı reddi; 5 dakikalık medya yetkisi; görünüm sürecinde Node ve sahte IPC olmaması |
| Ses | `voice.spec.ts` | Katılımcıların birbirini görmesi; mikrofonun açılıp karşı tarafa ses paketlerinin ulaşması; kamera görüntüsü; sayfa değişiminde görüşmenin sürmesi; ayrılma |
| Etkinlikler | `activities.spec.ts` | Anket oluşturma, oy ve sayım (geçici çözümle); yeni odada anket (bilinen hata); ilk yükleme süresi (bilinen hata); Kıraathane masaları |
| Tercihler | `settings.spec.ts` | Görünüm ayarının açık kayıtla saklanıp yeniden açılışta korunması; kaydedilmemiş değişikliğin geri alınması |

Kapsam dışı ve neden:

| Alan | Neden |
| --- | --- |
| Ekran paylaşımı | macOS Ekran Kaydı izni gerekir; `voice.spec.ts` içinde nedeniyle atlanır |
| Birlikte izle / YouTube | İstemci yalnız HTTPS topluluk kaynağında oynatıcı açar |
| DJ / müzik | Ayrı müzik servisi, kaynak köprüsü ve sağlayıcı erişimi |
| Agent, HostOps, uzaktan kontrol | Ayrı yetkili servisler ve fiziksel onay akışları |
| Oyunların oynanması | Masalar 2–4 oyunculu sıra ister; yalnız masa durumu sınanır. Kurallar `tests/games*.test.ts` içinde |
| Dosya ekleri | Yerel dosya seçme iletişim kutusu; sonraki aşamada `dialog` main sürecinde değiştirilerek eklenebilir |

## Bulunan hatalar

Paket ilk çalıştırmada aşağıdaki ürün hatalarını buldu. Testler gerçek beklentiyi yazar ve `test.fail` ile işaretlidir: hata sürdükçe paket yeşil kalır, hata düzeltildiğinde test **beklenmedik şekilde geçer** ve paket kırmızıya döner. O zaman `test.fail` satırını kaldır.

| Hata | Test | Ayrıntı |
| --- | --- | --- |
| Reaksiyonlar gerçek Stoat'ta çalışmıyor | `chat.spec.ts` › reactions | Seçici `2764` gibi kod noktası kimlikleri gönderir. IPC ve bağdaştırıcı yalnız `[A-Za-z0-9_-]` kabul eder (`community.ts`, `stoat-adapter`). Stoat v0.15.5 bu değeri `400 InvalidOperation` ile reddeder; emojinin kendisini (`❤`) kabul eder. |
| Yeni veya boş odada anket açılamıyor | `activities.spec.ts` › fresh voice room | "Yeni anket", katılımcı ve `canCreate` ister. İstemci etkinlik odasına yalnız `send()` içinde katılır; servis 30 sn hareketsiz katılımcıyı düşürür. Sahip dahil kimse formu açamaz. Anket testi, istemcinin göndereceği `join` komutunu önceden göndererek geri kalan akışı sınar. |
| Yeni odada etkinlik görünümü 20 sn bekliyor | `activities.spec.ts` › loads promptly | İlk `observe()` çağrısı `afterRevision=0&waitMs=20000` ile uzun yoklama yapar; hiç kullanılmamış oda (revizyon 0) tam 20 sn boyunca "Oda getiriliyor…" gösterir. |
| Kanal oluşturma ara sıra 20 sn takılıyor | `channels.spec.ts` › `test.fixme` | Kanal üst sistemde oluşur, ancak iletişim kutusu bazen ~20 sn "Kaydediliyor…" kalır; bazen 0,3 sn'de kapanır. Kararsız olduğu için doğrulanmaz, `test.fixme` ile kayıtlıdır. Süre, etkinlik uzun yoklamasıyla örtüşüyor; kök neden henüz doğrulanmadı. |

## Yeni test yazmak

```ts
import { test, expect } from '../support/fixtures';
import { ChatView } from '../support/pages/chat';
import { uniqueText } from '../support/seed';

test('bir üyenin mesajı diğerine ulaşır', async ({ owner, guest, run }) => {
  const ownerChat = await new ChatView(owner).open(run.channels.text.name);
  const guestChat = await new ChatView(guest).open(run.channels.text.name);
  const text = uniqueText('Merhaba');
  await ownerChat.send(text);
  await expect(guestChat.message(text)).toBeVisible();
});
```

Kurallar:

- **Arayüzü kullanıcı gibi sür.** Rol ve erişilebilir adla seç (`getByRole('button', { name: 'Mesajı gönder' })`). Sınıf adı veya `data-*` seçicisinden kaçın; arayüz Türkçedir ve etiketler kararlıdır.
- **Düzenlemeyi API ile, doğrulamayı arayüzle yap.** Hesap, kanal ve üyelik hazırlığı için `seed.ts` ve `StoatApi` kullan. Test edilen davranışı ise pencereden yürüt. Üst sistemde iz bırakan sonuçları (`display_name`, kanal türü, bilet durumu) ayrıca API ile doğrula.
- **Benzersiz veri kullan.** Mesaj ve kanal adlarında `uniqueText()` kullan. İlişki değiştiren testlerde `provisionAccount()` ile yeni hesap aç; ortak `owner`/`guest` ilişkilerini değiştirme.
- **Sabit bekleme yazma.** `waitForTimeout` yerine `expect(...).toBeVisible()` ve `expect.poll()` kullan.
- **Medyayı paketle kanıtla.** Ses ve görüntü için `VoiceView.tapPeerConnections()` katılımdan önce çağrılır; `expectMediaFlowing()` gelen RTP paketlerini sayar.
- **Bilinen hatayı gizleme.** Ürün hatası bulursan beklentiyi değiştirme. `test.fail(true, 'neden')` ekle ve yukarıdaki tabloya satır yaz. Kararsız hata için `test.fixme` kullan. Geçici çözüm gerekiyorsa adını ve nedenini koda yaz.
- **Yeni ön koşulu açıkla.** Test HTTPS, sağlayıcı hesabı veya işletim sistemi izni istiyorsa `test.skip(true, 'neden')` ile atla ve kapsam dışı tablosunu güncelle.

## Hata ayıklama

- **Rapor:** `pnpm e2e:report`. Başarısız testte her pencere için ekran görüntüsü (`<etiket> screenshot`), erişilebilirlik ağacı (`<etiket> aria snapshot`), görünüm süreci hataları ve Playwright izi bulunur.
- **İz:** `pnpm exec playwright show-trace .local/e2e/test-results/<test>/attachments/<etiket>-trace-*.zip`. Her adımın DOM görüntüsü ve zaman çizelgesi açılır.
- **Servis günlükleri:** `pnpm e2e:stack logs api`, `logs access`, `logs livekit`. Erişim servisi istek günlüğü tutmaz; LiveKit ayrıntısı için `.local/e2e/stack/livekit.yaml` içinde `log_level: debug` yapıp `docker restart rooms-e2e-livekit-1` çalıştır. Bir sonraki `up` dosyayı şablondan yeniden üretir.
- **Elle inceleme:** `run.json` içindeki hesapla `pnpm dev` istemcisinde `http://127.0.0.1:4100` adresine giriş yapabilirsin. Dosya yalnız yerel atılabilir yığının şifrelerini içerir.

## Güvenlik kuralları

- Paket yalnız `127.0.0.1` hedefler. `env.ts` başka bir ana bilgisayarı reddeder; üretim sunucusuna veya başka bir topluluğa yöneltilmez. Uzak, sahip olunan atılabilir ortam desteği eklenecekse ayrı ve açık onaylı bir hedef olarak tasarlanmalıdır ([AGENTS.md](../AGENTS.md)).
- `.local/e2e/` içindeki sırları, `run.json` dosyasını, raporları ve izleri commit etme veya paylaşma. İzler oturum belirteci içeren ağ isteklerini gösterebilir.
- Testler ürün koduna test kancası eklemez. Sentetik medya yalnız Chromium komut satırı anahtarlarıyla ve test sürecinde açılır.
- Uygulama kodu değişmeden yalnız test eklemek bir kabul kaydı değildir. Sonucu ortam, sürüm ve atlanan kontrollerle birlikte bildir.

## Sorun giderme

| Belirti | Çözüm |
| --- | --- |
| `The local e2e stack is not ready` | `pnpm e2e:stack up`; sürerse `pnpm e2e:stack status` ve ilgili servisin günlükleri |
| `The desktop app is not built` | `pnpm build` |
| `Docker is not running` | Docker Desktop'ı başlat |
| `port is already allocated` (7880 veya 4100) | Başka yerel LiveKit veya servis kapat; `lsof -nP -iTCP:7880 -sTCP:LISTEN` |
| Ses testinde "Unable to connect to the media server" | LiveKit 7880'de dinlemiyor veya CSP dışı bir adres verilmiş; `pnpm e2e:stack status` |
| Hesap oluşturmada `429` | Stoat hız sınırı; `StoatApi` bekleyip yeniden dener. Sürerse birkaç saniye sonra tekrar çalıştır |
| Garip, kalıcı durum | `pnpm e2e:stack reset && pnpm e2e:stack up` |
