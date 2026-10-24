# Tayfa arkadaş masası kuralları — v1

Oyun kuralları yalnızca yetkili Activity sunucusunda çalışır. Sürümlü komutlar güncel oda üyeliği, beklenen oda sürümü ve benzersiz komut kimliği gerektirir. Oyunlarda gerçek paraya çevrilemeyen sanal fişler kullanılır; gerçek para ödemesi veya kazanç ödemesi yoktur.

## Ortak masa yaşam döngüsü

Masa oluşturun, oturun, masa sahibiyseniz isteğe bağlı bot ekleyin ve eli başlatın. Kapasiteler: Holdem 2–9, Blackjack 1–7, İhaleli/Eşli/Koz Maça Batak 4, Gömmeli Batak 3, 101 Okey 4 kişi. Holdem veya Blackjack eli sürerken boş yere oturanlar sonraki eli bekler. Bot eklemek yeni el dağıtmaz veya mevcut kartları değiştirmez.

Bağlantısı kopanın koltuğu kullanıcı kimliğini, kartlarını, katkısını, konumunu ve puanını korur. 30 saniye sonra aynı koltuğu kural botu yönetir. Hareketsiz sıra 45 saniyede biter ve temkinli, kurallı bot hamlesi uygulanır. Dönen kişi kendi yerinde Otur seçeneğiyle güvenli sıra sınırında kontrolü geri alır. Görünüm veya etkinlik değiştirmek ses odasından ayrılmayı çağırmaz. Önceki oda ev sahibi ayrılınca en eski uygun etkinlik katılımcısı masa sahibi olur.

Depo, yeniden başlatmadan kurtarma için etkin özel eli saklar. Açık durum her yetkili kullanıcı için ayrı üretilir. Tamamlanan el geçmişi sonuçları, ortak kartları ve puanları içerir; gizli elleri veya desteyi/stoku içermez. Başka masa başlatmak yalnızca geçmiş/istatistikleri arşivler; eski özel kartlar arşivde tutulmaz. Masa istatistikleri el, galibiyet ve toplam Batak/101 puanlarını izler. Sezon yoktur.

## Texas Holdem — `rooms-holdem-v1`

Kör bahisler sabit 10/20, başlangıç sanal bakiyesi 1000'dir. Buton her elde döner. İki kişide buton küçük körü koyar ve flop öncesi önce oynar. Tüm bahis turları, pas/check/call/raise, all-in, yan pot, bölüşülen pot ve kart açma sunucuda çalışır. Tam artırma bahsi yeniden açar; kısa all-in, birikmiş artış son tam artırmaya ulaşana kadar yeniden açmaz. Karşılanmayan katkı ilgili tek kişilik yan pot üzerinden iade edilir. Bölüşümde artan tek fişler butondan saat yönünde dağıtılır. Her ortak kart turundan önce bir kart yakılır.

Kart açmaya kadar yalnızca kendi kapalı kartlarınız görünür. Pas geçenin kartları bitişte de gizli kalır; kalanların kartları açılır. Stok hiçbir zaman gösterilmez. Fiş toplamı her elde korunur; açık sanal yeniden satın alma akışı eklenene kadar boş/küçük bakiye için yeni masa gerekir. Botlar yalnızca kendi kartlarını ve açık bahis durumunu kullanarak temkinli call/check yapar.

## Blackjack — `rooms-blackjack-v1`

Tüm oyuncular aynı krupiyeye karşı oynar. Altı destelik ayakkabı kullanılır; krupiye yumuşak 17'de durur, doğal blackjack 3:2 öder. 3:2 ödemelerinin tam sayı olması için bahisler pozitif çift tam sayı olmalıdır. Kart çekme, durma, başlangıçtaki herhangi iki kartla ikiye katlama, bölmeden sonra ikiye katlama ve en fazla dört bölünmüş el desteklenir. On değerindeki farklı kartlar bölünebilir. As, on değerli kartla bölünemez. Bölünmüş aslara yalnızca birer kart verilir; bölünmüş 21 doğal blackjack değil normal galibiyet öder. Aslar yeniden bölünmez. Bölünen elin ikinci kartı, sıra o ele gelene kadar dağıtılmaz; masada yalnızca tek kartlı bekleyen el görünür.

Masa seçenekleri (tur başlarken sabitlenir ve görünümde yayımlanır). Varsayılanlar:

- Sigorta (`insurance`, **açık**): krupiyenin açık kartı as ise, kapalı karta bakılmadan önce her oyuncuya sırayla sigorta sorulur. Sigorta ilk elin bahsinin yarısıdır ve 2:1 öder (yatırılan yarım bahis dahil toplam 3 katı geri gelir); krupiyede doğal blackjack varsa ödenir, yoksa yarım bahis kaybolur ve oyun normal başlar. Bahis çift olduğundan yarım bahis her zaman tam sayıdır. Bakiyesi yarım bahse yetmeyen oyuncuya sorulmaz. Sigorta sorulurken kalan oyuncular beklemek zorundadır; `insurance` yanıtı dışında yalnızca "reddet" (`decline-insurance`) geçerlidir. Bot ve zaman aşımı yalnızca hit/stand bildiğinden bu iki eylem sigortayı reddetme sayılır. Açık kart on değerliyse krupiye hemen bakar ve doğal blackjack turu bitirir. "Eşit para" ayrı bir eylem değildir; doğal blackjack'li oyuncunun sigorta alması aynı sonucu verir.
- Teslim olma (`surrender`, **kapalı**): açıksa, krupiye doğal blackjack yapmadığı bilindikten sonra (geç teslim), bölünmemiş elin ilk kararında oyuncu teslim olup bahsin yarısını geri alır. Teslim olunan el krupiyenin çekmesine sebep olmaz.

Krupiyenin kapalı kartı ve deste bitişe kadar açık görünümde yer almaz. Oyuncu kartları gerçek Blackjack masasındaki gibi açıktır. Botlar 17 ve üstünde durur, altında çeker. Krupiyenin doğal blackjack'i turu hemen bitirir. Krupiye yalnızca iflas etmemiş, doğal olmayan ve teslim olunmamış bir el kaldıysa kart çeker; yalnızca doğal blackjack'ler ve iflaslar varsa ikinci kartı açılır ama çekmez.

## Batak — `rooms-batak-v1`

Tüm türler jokersiz standart 52 kart kullanır. İhaleli ve Eşli'de kişiye 13, Gömmeli'de 16 kart ve dört kartlık gömü vardır. Açılan renge uymak zorunludur. Aynı renkte eli almak mümkünse üstüne çıkılmalıdır. Renk yoksa mümkün olduğunda koz, mümkünse üst koz atılmalıdır. Takım arkadaşı kazanırken de bu zorunluluklar geçerlidir; bu, yazılmamış ev kuralı istisnası değil yayımlanan Tayfa profilidir.

Koz kırılmadan koz açılmaz (`noTrumpLeadUntilBroken`, **açık**): koz, başka bir rengin açılışında oynanıp kırılana kadar bir el koz ile açılamaz. Elinde yalnızca koz kalan oyuncu istisnadır. Kırılma, kozun koz olmayan bir açılışa atılmasıyla (kesme veya renksiz atış) olur ve elin sonuna kadar sürer. Kural kapalıysa her kart açılabilir.

- İhaleli: artan ihale, en az 5/en fazla 13; kazanan kozu seçer ve başlar. İhaleci başarılıysa aldığı el kadar, başarısızsa eksi ihale kadar puan alır. Savunmacılar kendi ellerini yazar.
- Eşli: karşılıklı koltuklar takım; artan ihale en az 8. İhalecinin takımı başarılıysa toplam aldığı eli, değilse eksi ihaleyi yazar; savunmacılar takım ellerini yazar.
- Koz Maça: koz sabit maça; herkes bir kez 1–13 kişisel taahhüt verir. Pas, en az 1 anlamındadır. Kendi taahhüdüne ulaşan aldığı eli, ulaşamayan eksi taahhüdü yazar. Koz seçme ekranı yoktur.
- Gömmeli: artan ihale, en az 8/en fazla 16. İhaleci kozu seçer, dört gömü kartını alır, sonra kendi dört kartını gizlice gömer. Gömülenler gizli kalır; yalnızca ihaleci gömdükten sonra kendi gömüsüne bakabilir. İhale ve savunma puanlaması İhaleli gibidir.

İsteğe bağlı puanlama seçenekleri (tur başlarken sabitlenir ve görünümde yayımlanır; ikisi de **kapalı**; İhaleli, Eşli ve Gömmeli'de geçerlidir, Koz Maça'da etkisizdir):

- Savunmacı batağı (`defenderBatakPenalty`): hiç el almayan savunmacı (Eşli'de hiç el almayan savunma takımı) kendi eli olan 0 yerine eksi ihale kadar puan yazar.
- İhale kadar yaz (`writeContract`): başarılı ihaleci (Eşli'de takım) aldığı el sayısı yerine tam ihale kadar puan yazar; başarısız olursa yine eksi ihale kadardır.

Herkes pas geçerse son kalan ihaleci en düşük taahhüdü alır. Biten eller ve puanlar açıktır. Koz, ihale boyunca ve koz seçilene kadar görünümde gizlidir (Koz Maça'da baştan maçadır). Pas geçenler ve ihale/pas sırası (`passed`, `bidLog`) herkese açıktır. İhale, koz, gömü, renge uyma, koz açma ve üst koz sunucuda doğrulanır. Botlar pas geçer, en uzun rengini seçer, düşük koz dışı kartları gömer ve en düşük yasal kartı oynar; başka eli incelemez.

İstatistikteki "galibiyet" artık puanın sıfırdan büyük olması değildir: ihaleci ihaleyi tutturursa, savunmacılar ihaleciyi batırırsa kazanır; Eşli'de takım olarak aynı şekilde sayılır. Koz Maça'da kendi taahhüdünü tutturanlar arasında en yüksek puanı yazan (eşitlikte hepsi) kazanır, kimse tutturmadıysa kimse kazanmaz.

## 101 Okey — `rooms-101-v2`

Klasik Okey değil yalnızca 101 uygulanmıştır. Katlamalı/katlamasız ve eşli/eşsiz tüm birleşimler desteklenir. Deste 104 normal fiziksel taş ve iki sahte okey içerir; normal taşlardan biri göstergedir. Gösterge rengindeki sonraki değer gerçek okeydir; 13'ten sonra 1 gelir. Sahte okey o normal değeri temsil eder, serbest taş değildir. İlk oyuncu 22, diğerleri 21 taş alır; sıra çekip atmakla ilerler, ilk oyuncu başlangıçta yalnızca atar.

Seriler tek renk, en az üç taşlıdır; varsayılan olarak 13→1 dönüşü yoktur. Gruplar aynı değerin üç veya dört farklı rengidir. İstemci sıralı fiziksel taş kimliklerini gönderir; sunucu sahiplik/tekilliği denetleyip okeyin yerine geçtiği taşı çıkarır. Tek doğal taş ve okeylerden oluşan bir per hem seri hem grup okunabilir: sunucu iki okumayı da dener, yalnızca geçerli olanı kabul eder (`[12, okey, okey]` 12'li gruptur, `[okey, 1, okey]` 1'li gruptur). İkisi de geçerliyse (`[7, okey, okey]`: 7-8-9 ya da üç 7) per başına `run`/`group` ipucu seçer, ipucu yoksa seri okunur. Masadaki per türünü ve okeylerinin değerini korur; işleme bir grubu seriye çevirmez. Açmak için en az 101 gerekir; katlamalıda ayrıca önceki en yüksek açılıştan kesin yüksek olmalıdır. Çift açmak beş fiziksel çift gerektirir; katlamalıda biri çiftle açtıktan sonra sonraki çift açılış bir çift fazlasını ister (5→6→7…). Açılış biçimi sonradan değişmez. Aynı biçimde ek perler açılış eşiği yeniden aranmadan konabilir. Çift açanlar dahil açılmış oyuncular mevcut seri/gruplara işleyebilir; tek işlemede taşlar serinin iki ucuna birden eklenebilir (5-6-7'ye 4 ve 8). Tam doğal taşla değiştirme yerdeki okeyi ele geri verir. Çift perler genişletilemez.

Önceki oyuncudan alınan atılmış taş aynı turda kullanılmalıdır. Atmak için bir taş saklanmalıdır; bitiş son taşı atmayı gerektirir. Açılmamış el 202, açılmış el kalan değerler toplamını yazar; eldeki gerçek okey 101 sayılır. Kazanan -101 yazar. Gerçek okeyle veya çiftten bitiş puanları bir kez ikiye katlar (kazanan -202); okey ve çift birlikte yine bir kez katlar. Eşlide karşılıklı koltuk puanları toplanır. Stok biterse kazanan olmadan kalan puanlarıyla el biter. Botlar yasal doğal perleri seçer, yasal işlemeleri yapar ve daha güçlü birleşimleri tutar; yalnızca kendi taşlarını ve açık perleri görür.

### Masa kuralı seçenekleri

Her el `rules.options` içinde aşağıdaki anahtarları taşır; parantezdeki değer yaygın Türk masası alışkanlığına göre varsayılandır. Cezalar ve gösterge ödülü (`penalties`) el sonunda oyuncunun puanına çarpansız eklenir, eşli toplamdan önce. Seçenekleri olmayan eski (`rooms-101-v1`) eller v1 kurallarıyla biter.

- `islekPenalty` (açık): Masadaki bir seri/gruba işlenebilecek taşı, yerdeki bir okeyi serbest bırakacak doğal taşı veya bir pere girebilecek okeyi atan oyuncu +101 ceza yazar. Bitiren son taş cezasızdır, çünkü kimse alamaz. Çift perler işlek saymaz.
- `eldenBitme` (açık): Daha önce açmamış oyuncu aynı turda açıp biterse diğerlerinin cezası ikiye katlanır. Okey veya çift bitişiyle üst üste uygulanır, en fazla dört kat (okeyle elden bitişte diğerleri ×4, kazanan -202). Kazananın -101/-202 puanı elden bitmeyle değişmez.
- `pickupPenalty` (açık): Yandan alınan taş, atış anında hâlâ eldeyse +101 ceza yazılır; alınan taşın kendisini geri atmak da cezalıdır. `pickupUndo` kapalıyken alınan taş yere geri konamaz; Çek ile geri alma reddedilir.
- `pickupUndo` (kapalı): Açıkken Çek, alınan taşı yere geri koyup stoktan çeker; `pickupPenalty` açıksa bu da +101 yazar. `pickupPenalty` kapalıyken geri alma her zaman açıktır ve v1 davranışı geçerlidir: alınan taş eldeyken atış reddedilir ve Çek almayı cezasız geri alır.
- `foldingPairs` (açık): Katlamalı masada çift açılış eşiği yukarıdaki gibi artar; katlamasız masada her zaman beş çifttir.
- `gostergeBonus` (açık): Göstergenin eşini (aynı renk ve değerdeki diğer fiziksel taş) ilk turunda, ilk atışından önce gösteren oyuncu -101 yazar; her koltuk bir kez. Çekmeden önce veya sonra gösterilebilir.
- `wrapAround` (kapalı): Açıkken bir seri 12-13-1 ile bitebilir ve bu yüksek 1 açılışta 11 sayılır. 13-1-2 hiçbir zaman geçerli değildir.
- `reclaimedOkeyMustBeUsed` (kapalı): Açıkken yerden alınan okey aynı turda elden çıkmazsa, atışta +101 ceza yazılır.

## Doğrulama ve kalan kabul

`pnpm typecheck` ve `pnpm test` başarılıdır. Testler gerçek TCP istemcileriyle iki insanlı tam Holdem elini, özel görünümleri ve aynı komutun tekrarını; sunucuyla tam Blackjack/Batak/101 turlarını; el ortasında kart değiştirmeyen bot eklemeyi; dört Batak türünü ve dört 101 profilini; fiş korunmasını, all-in yeniden açılmasını, eşit yan potları, okeyle açma/değiştirmeyi, yinelenen fiziksel taşları, çift bitiş/işlemeyi, atılan taş kısıtlarını, yumuşak as ve bölünmüş as ödemelerini kapsar.

Bunlar test üyelik çözümleyicisiyle yerel kural/servis davranışını doğrular. Dağıtılmış gerçek Stoat yetkisi, masaüstü oyun etkileşimi/görselleri, iki fiziksel bilgisayar, PostgreSQL yeniden başlatma kurtarması ve kapsamlı strateji/ev kuralı incelemesi ayrı kabuldür. Yukarıdaki profiller Tayfa'nın açık seçimleridir; tüm arkadaş gruplarının aynı kuralları kullandığı iddiası değildir.
