/**
 * Copy for the "Kendi sunucunu kur" start tab. Providers and links live here alone so they can be
 * changed without touching the component; prices are left out on purpose because they drift.
 */
export interface SelfHostLink {
  label: string;
  url: string;
}
export interface SelfHostStep {
  title: string;
  body: string;
  links?: SelfHostLink[];
  commands?: { label: string; value: string }[];
  /** Step that ends on the Giriş yap tab instead of an external site. */
  signIn?: boolean;
}

export const SELF_HOST_INSTALL_COMMAND =
  'curl -fsSL https://raw.githubusercontent.com/egemenmermer/rooms/main/deploy/install.sh | sudo bash';
export const SELF_HOST_GUIDE_URL =
  'https://github.com/egemenmermer/rooms/blob/main/docs/SELF_HOSTING.md';

export const SELF_HOST_STEPS: SelfHostStep[] = [
  {
    title: 'Sunucu kirala',
    body: 'Ubuntu 24.04 seç; en az 2 GB RAM yeter, 4 GB önerilir. Sana verilen IP adresini not al.',
    links: [
      { label: 'Hetzner Cloud', url: 'https://www.hetzner.com/cloud' },
      { label: 'DigitalOcean', url: 'https://www.digitalocean.com/products/droplets' },
      { label: 'Contabo', url: 'https://contabo.com/en/vps/' },
    ],
  },
  {
    title: 'Ücretsiz adres al',
    body: 'DuckDNS’te bir ad al (ör. arkadaslar.duckdns.org) ve token’ını sakla; kurulum adresi IP’ne bağlar. Kendi alan adın varsa A kaydını sunucunun IP’sine yönlendir.',
    links: [{ label: 'DuckDNS', url: 'https://www.duckdns.org' }],
  },
  {
    title: 'Portları aç',
    body: 'Sağlayıcının güvenlik duvarında 80 ve 443 (TCP), 7881 (TCP) ve 7882 (UDP) portlarına izin ver.',
  },
  {
    title: 'Kur',
    body: 'Mac’te Terminal’i, Windows’ta PowerShell’i aç. Sunucuya bağlan, sonra kurulum komutunu yapıştır. Soruları yanıtla; sahip hesabın ve ilk topluluğun oluşur.',
    commands: [
      { label: 'Bağlan', value: 'ssh root@SUNUCU_IP' },
      { label: 'Kurulum komutu', value: SELF_HOST_INSTALL_COMMAND },
    ],
  },
  {
    title: 'Bağlan ve davet et',
    body: 'Giriş yap sekmesinde sunucu olarak https://adresin yaz ve sahip hesabınla gir. Sonra “Davet oluştur” ile bağlantıyı arkadaşlarına gönder.',
    signIn: true,
  },
];
