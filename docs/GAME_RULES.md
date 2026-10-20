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

Tüm oyuncular aynı krupiyeye karşı oynar. Altı destelik ayakkabı kullanılır; krupiye yumuşak 17'de durur, doğal blackjack 3:2 öder, sigorta kapalıdır. 3:2 ödemelerinin tam sayı olması için bahisler pozitif çift tam sayı olmalıdır. Kart çekme, durma, başlangıçtaki herhangi iki kartla ikiye katlama, bölmeden sonra ikiye katlama ve en fazla dört bölünmüş el desteklenir. On değerindeki farklı kartlar bölünebilir. As, on değerli kartla bölünemez. Bölünmüş aslara yalnızca birer kart verilir; bölünmüş 21 doğal blackjack değil normal galibiyet öder. Aslar yeniden bölünmez.

Krupiyenin kapalı kartı ve deste bitişe kadar açık görünümde yer almaz. Oyuncu kartları gerçek Blackjack masasındaki gibi açıktır. Botlar 17 ve üstünde durur, altında çeker. Krupiyenin doğal blackjack'i turu hemen bitirir.

## Batak — `rooms-batak-v1`

Tüm türler jokersiz standart 52 kart kullanır. İhaleli ve Eşli'de kişiye 13, Gömmeli'de 16 kart ve dört kartlık gömü vardır. Açılan renge uymak zorunludur. Aynı renkte eli almak mümkünse üstüne çıkılmalıdır. Renk yoksa mümkün olduğunda koz, mümkünse üst koz atılmalıdır. Takım arkadaşı kazanırken de bu zorunluluklar geçerlidir; bu, yazılmamış ev kuralı istisnası değil yayımlanan Tayfa profilidir.

- İhaleli: artan ihale, en az 5/en fazla 13; kazanan kozu seçer ve başlar. İhaleci başarılıysa aldığı el kadar, başarısızsa eksi ihale kadar puan alır. Savunmacılar kendi ellerini yazar.
- Eşli: karşılıklı koltuklar takım; artan ihale en az 8. İhalecinin takımı başarılıysa toplam aldığı eli, değilse eksi ihaleyi yazar; savunmacılar takım ellerini yazar.
- Koz Maça: koz sabit maça; herkes bir kez 1–13 kişisel taahhüt verir. Pas, en az 1 anlamındadır. Kendi taahhüdüne ulaşan aldığı eli, ulaşamayan eksi taahhüdü yazar. Koz seçme ekranı yoktur.
- Gömmeli: artan ihale, en az 8/en fazla 16. İhaleci kozu seçer, dört gömü kartını alır, sonra kendi dört kartını gizlice gömer. Gömülenler gizli kalır. İhale ve savunma puanlaması İhaleli gibidir.

Herkes pas geçerse son kalan ihaleci en düşük taahhüdü alır. Biten eller ve puanlar açıktır. İhale, koz, gömü, renge uyma ve üst koz sunucuda doğrulanır. Botlar pas geçer, en uzun rengini seçer, düşük koz dışı kartları gömer ve en düşük yasal kartı oynar; başka eli incelemez.

## 101 Okey — `rooms-101-v1`

Klasik Okey değil yalnızca 101 uygulanmıştır. Katlamalı/katlamasız ve eşli/eşsiz tüm birleşimler desteklenir. Deste 104 normal fiziksel taş ve iki sahte okey içerir; normal taşlardan biri göstergedir. Gösterge rengindeki sonraki değer gerçek okeydir; 13'ten sonra 1 gelir. Sahte okey o normal değeri temsil eder, serbest taş değildir. İlk oyuncu 22, diğerleri 21 taş alır; sıra çekip atmakla ilerler, ilk oyuncu başlangıçta yalnızca atar.

Seriler tek renk, en az üç taşlıdır; 13→1 dönüşü yoktur. Gruplar aynı değerin üç veya dört farklı rengidir. İstemci sıralı fiziksel taş kimliklerini gönderir; sunucu sahiplik/tekilliği denetleyip okeyin yerine geçtiği taşı çıkarır. Açmak için en az 101 gerekir; katlamalıda ayrıca önceki en yüksek açılıştan kesin yüksek olmalıdır. Çift açmak beş fiziksel çift gerektirir. Açılış biçimi sonradan değişmez. Aynı biçimde ek perler açılış eşiği yeniden aranmadan konabilir. Çift açanlar dahil açılmış oyuncular mevcut seri/gruplara işleyebilir. Tam doğal taşla değiştirme yerdeki okeyi ele geri verir. Çift perler genişletilemez.

Önceki oyuncudan alınan atılmış taş aynı turda kullanılmalıdır. Kullanılamıyorsa Çek eylemi almayı geri alıp stoktan çeker. Atmak için bir taş saklanmalıdır; bitiş son taşı atmayı gerektirir. Açılmamış el 202, açılmış el kalan değerler toplamını yazar; eldeki gerçek okey 101 sayılır. Kazanan -101 yazar. Gerçek okeyle veya çiftten bitiş puanları bir kez ikiye katlar; çarpanlar üst üste uygulanmaz. Eşlide karşılıklı koltuk puanları toplanır. Stok biterse kazanan olmadan kalan puanlarıyla el biter. Botlar yasal doğal perleri seçer, yasal işlemeleri yapar ve daha güçlü birleşimleri tutar; yalnızca kendi taşlarını ve açık perleri görür.

## Doğrulama ve kalan kabul

`pnpm typecheck` ve `pnpm test` başarılıdır. Testler gerçek TCP istemcileriyle iki insanlı tam Holdem elini, özel görünümleri ve aynı komutun tekrarını; sunucuyla tam Blackjack/Batak/101 turlarını; el ortasında kart değiştirmeyen bot eklemeyi; dört Batak türünü ve dört 101 profilini; fiş korunmasını, all-in yeniden açılmasını, eşit yan potları, okeyle açma/değiştirmeyi, yinelenen fiziksel taşları, çift bitiş/işlemeyi, atılan taş kısıtlarını, yumuşak as ve bölünmüş as ödemelerini kapsar.

Bunlar test üyelik çözümleyicisiyle yerel kural/servis davranışını doğrular. Dağıtılmış gerçek Stoat yetkisi, masaüstü oyun etkileşimi/görselleri, iki fiziksel bilgisayar, PostgreSQL yeniden başlatma kurtarması ve kapsamlı strateji/ev kuralı incelemesi ayrı kabuldür. Yukarıdaki profiller Tayfa'nın açık seçimleridir; tüm arkadaş gruplarının aynı kuralları kullandığı iddiası değildir.
