# RC29 — Yönetici rolü

Topluluk sahibi artık başkalarına kendisiyle aynı yetkileri verebilir. İçeriğin geri kalanı RC28 ile aynı.

## Ne değişti

Sunucu rolleri Stoat'un bütün izinlerini veren üye, örneğin `developer` rolündekiler, Tayfa'da topluluk sahibi gibi sayılır:

- Davet bağlantılarını listeler ve iptal eder.
- Sinema'ya sunucu IPTV hesabını bağlar, yeniler ve kaldırır.
- Ayarlar'daki **Sunucu makinesi** sayfasını ve terminali kullanır.
- Topluluğu düzenler ve üyeleri çıkarır.

Böyle bir rolü yalnızca sahip ya da başka bir yönetici oluşturup atayabilir. Zaman aşımındaki üye yönetici sayılmaz. Rolün izinlerinden biri kapatılırsa yöneticilik de düşer. Sunucuyu silmek ve sahipliği devretmek sahibe özel kalır. Kural [Mimari](ARCHITECTURE.md) belgesinde.

## Paketler ve doğrulama

Mac paketi imzalanıp noter onayı alır ve yayından önce bu Mac'te açılarak denenir. Windows paketi aynı commit'ten derlenir. Sunucuda access, cinema ve hostops servisleri bu sürümle güncellenir. Gerçek bir yönetici hesabıyla cihaz denemesi ayrıca yapılır.
