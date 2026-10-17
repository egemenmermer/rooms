import {
  cinemaArtUrl,
  type CinemaBridge,
  type CinemaErrorCode,
} from '../../../../packages/community-cinema/src/bridge';

/** A local development stand-in; it never reaches a cinema service or a provider. */
export interface CinemaFixture {
  bridge: CinemaBridge;
  /** Generated artwork for fixture art ids. */
  art(artId: string): string | null;
}

const fixtures: CinemaFixture[] = [];

/** Production always uses the native bridge; a DEV fixture only exists when one was installed. */
export function getCinemaBridge(): CinemaBridge | undefined {
  if (import.meta.env.DEV && fixtures.length) return fixtures[fixtures.length - 1]!.bridge;
  return typeof window === 'undefined' ? undefined : window.rooms?.cinema;
}

export function installCinemaFixture(fixture: CinemaFixture): () => void {
  if (!import.meta.env.DEV) throw new Error('Cinema fixtures are unavailable in production.');
  fixtures.push(fixture);
  return () => {
    const index = fixtures.indexOf(fixture);
    if (index !== -1) fixtures.splice(index, 1);
  };
}

/** The image URL for an artwork id; the main process serves it on `rooms-cinema:`. */
export function cinemaArt(hallId: string, artId: string | null | undefined): string | null {
  if (!artId) return null;
  if (import.meta.env.DEV && fixtures.length) return fixtures[fixtures.length - 1]!.art(artId);
  return cinemaArtUrl(hallId, artId);
}

const copy: Record<CinemaErrorCode, string> = {
  CINEMA_UNAVAILABLE: 'Sinema servisi şu an yanıt vermiyor. Biraz sonra yeniden dene.',
  CINEMA_OWNER_REQUIRED: 'Bunu yalnızca topluluk sahibi yapabilir.',
  CINEMA_HALL_REQUIRED: 'Bu toplulukta henüz bir sinema salonu seçilmedi.',
  CINEMA_ACCESS_DENIED: 'Sinema salonunu görme iznin yok.',
  CINEMA_NOT_CONNECTED: 'Sunucuya bağlı bir IPTV hesabı yok.',
  CINEMA_SOURCE_INVALID: 'Bilgiler eksik ya da hatalı. Sunucu adresini ve hesabı kontrol et.',
  CINEMA_PROVIDER_DENIED:
    'Sağlayıcı bu hesabı kabul etmedi. Kullanıcı adını ve şifreyi kontrol et.',
  CINEMA_PROVIDER_UNREACHABLE: 'Sağlayıcıya ulaşılamadı. Yayın kaynağı şu an kapalı olabilir.',
  CINEMA_ACCOUNT_EXPIRED: 'IPTV hesabının süresi dolmuş. Sahibin hesabı yenilemesi gerekiyor.',
  CINEMA_IMPORT_RUNNING: 'Katalog şu an yükleniyor. Bitince yeniden dene.',
  CINEMA_ITEM_NOT_FOUND: 'Bu içerik artık katalogda yok.',
  CINEMA_NOTHING_SELECTED: 'Salonda şu an açık bir şey yok.',
  CINEMA_RELAY_BUSY: 'Hesabın aynı anda açabileceği yayın sınırı dolu.',
  CINEMA_CODEC_UNSUPPORTED:
    'Bu kanalın görüntü biçimi salonda oynatılamıyor. Başka bir kanal dene.',
  CINEMA_STREAM_FAILED: 'Yayın açılamadı. Biraz sonra yeniden dene.',
};

/** The bridge code inside an error, if any (IPC wraps messages). */
export function cinemaErrorCode(error: unknown): CinemaErrorCode | null {
  const text = String(error instanceof Error ? error.message : error);
  const code = /CINEMA_[A-Z_]+/.exec(text)?.[0];
  return code && code in copy ? (code as CinemaErrorCode) : null;
}

export function cinemaErrorText(error: unknown): string {
  const code = cinemaErrorCode(error);
  if (code) return copy[code];
  const text = String(error instanceof Error ? error.message : error);
  if (/LIVE_PLAYBACK_FIXED/.test(text)) return 'Canlı yayın herkes için aynı anda akar; sarılamaz.';
  if (/SESSION_HOST_CONTROL/.test(text)) return 'Kumanda ev sahibinde.';
  if (/ACTIVITY_CONTROL_DENIED/.test(text)) return 'Bu salonda oynatmayı yönetme iznin yok.';
  if (/QUEUE_FULL/.test(text)) return 'Sıra dolu. Önce birkaç öğeyi kaldır.';
  return 'Bir şeyler ters gitti. Yeniden dene.';
}

export const cinemaErrorCopy = copy;
