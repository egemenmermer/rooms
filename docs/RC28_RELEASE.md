# RC28 — Mac'te açılmama düzeltmesi

RC27'nin Mac paketi açılışta çöküyordu; bu sürüm onu düzeltiyor. İçerik RC27 ile aynı, ayrıntılar [RC27 sürüm notunda](RC27_RELEASE.md).

## Ne oldu

RC27'de uygulama Tayfa adını alırken macOS paketinin iç adı (`CFBundleName`) da "Tayfa" yapıldı. Electron yardımcı süreçlerini bu ada göre arıyor. Paketteki yardımcıların adı ise "ROOMS Helper" kaldığı için uygulama daha pencere açılmadan kapanıyordu. Windows paketi bundan etkilenmedi.

Bu sürümde iç ad yeniden ROOMS. Finder'da ve Dock'ta görünen ad (`CFBundleDisplayName`) Tayfa olarak kalıyor. Bu ayarın bir daha değişmemesi için bir test eklendi.

## RC27'ye güncellemiş olanlar

Uygulama açılmadığı için kendi kendine güncellenemiyor. RC28'i indirip kurman yeterli: [RC28 DMG indir](https://github.com/egemenmermer/rooms/releases/download/v0.1.18-rc.28/ROOMS-0.1.18-rc.28-arm64.dmg). Oturumun ve ayarların yerinde kalır.

## Paketler ve doğrulama

Mac paketi imzalanıp noter onayı alır; bu kez kurulu paketin açıldığı yayından önce bu Mac'te denenir. Windows paketi aynı commit'ten yeniden derlenir. Sunucu RC27'de kalıyor; bu sürümde sunucu değişikliği yok.
