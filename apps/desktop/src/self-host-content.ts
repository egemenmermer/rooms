import { t } from './i18n';

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
  /** Short tokens shown as chips, such as the ports to open. */
  chips?: string[];
  commands?: { label: string; value: string }[];
}

export const SELF_HOST_INSTALL_COMMAND =
  'curl -fsSL https://raw.githubusercontent.com/egemenmermer/rooms/main/deploy/install.sh | sudo bash';
export const SELF_HOST_GUIDE_URL =
  'https://github.com/egemenmermer/rooms/blob/main/docs/SELF_HOSTING.md';

/** One step per screen; the last one ends on the Giriş yap tab. */
export const SELF_HOST_STEPS: SelfHostStep[] = [
  {
    title: t('Sunucu kirala'),
    body: t('Ubuntu 24.04 seç; 2 GB RAM yeter, 4 GB önerilir. Sana verilen IP adresini not al.'),
    links: [
      { label: 'Hetzner Cloud', url: 'https://www.hetzner.com/cloud' },
      { label: 'DigitalOcean', url: 'https://www.digitalocean.com/products/droplets' },
      { label: 'Contabo', url: 'https://contabo.com/en/vps/' },
    ],
  },
  {
    title: t('Ücretsiz adres al'),
    body: t(
      'DuckDNS’te bir ad al (ör. arkadaslar.duckdns.org) ve token’ını sakla; kurulum adresi IP’ne bağlar. Kendi alan adın varsa A kaydını IP’ye yönlendir.',
    ),
    links: [{ label: 'DuckDNS', url: 'https://www.duckdns.org' }],
  },
  {
    title: t('Portları aç'),
    body: t('Sağlayıcının güvenlik duvarında bu portlara izin ver:'),
    chips: ['80/TCP', '443/TCP', '7881/TCP', '7882/UDP'],
  },
  {
    title: t('Kur'),
    body: t(
      'Mac’te Terminal’i, Windows’ta PowerShell’i aç. Sunucuya bağlan, kurulum komutunu yapıştır ve soruları yanıtla.',
    ),
    commands: [
      { label: t('Bağlan'), value: t('ssh root@SUNUCU_IP') },
      { label: t('Kurulum komutu'), value: SELF_HOST_INSTALL_COMMAND },
    ],
  },
  {
    title: t('Bağlan ve davet et'),
    body: t(
      'Giriş yap sekmesinde sunucu olarak https://adresin yaz ve sahip hesabınla gir. Sonra “Davet oluştur” ile bağlantıyı arkadaşlarına gönder.',
    ),
  },
];
