import { t } from './i18n';

/** User-facing playback failures; never display raw provider diagnostics or credentials. */
export function musicPlaybackError(code: string, title?: string) {
  const song = title ? `“${title.slice(0, 160)}”` : t('Parça');
  const messages: Record<string, string> = {
    MUSIC_SPOTIFY_PLAYLIST_UNAVAILABLE: t(
      'Spotify listesi okunamadı. Listenin herkese açık olduğundan emin olup yeniden dene.',
    ),
    MUSIC_SPOTIFY_PLAYLIST_EMPTY: t(
      'Spotify listesinin herkese açık görünümünde şarkı bulunamadı. Özel veya boş bir liste olabilir.',
    ),
    MUSIC_SPOTIFY_PLAYLIST_LIMIT: t(
      'Spotify bu listenin tamamını göstermeyebilir. Eksik aktarmamak için 100 parçadan az bir liste kullan.',
    ),
    MUSIC_SPOTIFY_PLAYLIST_INCOMPLETE: t(
      'Spotify listesindeki bazı kayıtların şarkı bilgisi okunamadı. Liste eklenmedi; yerel dosya veya podcast içermeyen bir liste dene.',
    ),
    MUSIC_MIRROR_NOT_FOUND: t(
      '{song} için uygun bir YouTube kaydı bulunamadı. Liste kuyrukta duruyor; sonraki parçaya geçebilir veya şarkı adını arayabilirsin.',
      { song },
    ),
    MUSIC_YOUTUBE_ACCESS_REQUIRED: t(
      '{song} için YouTube ses erişimini reddetti. DJ sunucu oturumu kontrol edilmeli; tekrar tekrar eklemek bu engeli çözmez.',
      { song },
    ),
    MUSIC_YOUTUBE_UNAVAILABLE: t(
      '{song} YouTube’dan alınamadı. Video kaldırılmış, bölgeye kapalı veya geçici olarak erişilemiyor olabilir.',
      { song },
    ),
    MUSIC_SOURCE_TIMEOUT: t(
      '{song} yüklenirken süre doldu. Yeniden dene; sürerse başka bir kayıt seç.',
      { song },
    ),
    MUSIC_DECODE_FAILED: t(
      '{song} bulundu ancak ses akışı başlatılamadı veya kesildi. Parçayı yeniden seçerek dene.',
      {
        song,
      },
    ),
    MUSIC_TRACK_SKIPPED: t(
      'Bir parça çalınamadı ya da yarıda kesildi; DJ kuyrukta sıradakine geçti.',
    ),
    MUSIC_TRANSPORT_UNAVAILABLE: t(
      'DJ ses odasına bağlanamadı. Oda bağlantısını kontrol edip yeniden dene.',
    ),
    MUSIC_HISTORY_UNAVAILABLE: t('Müzik bağlantısı korunuyor, ancak DJ geçmişi kaydedilemedi.'),
    MUSIC_CACHE_LIMIT: t(
      'DJ’nin geçici ses alanı doldu. Kullanılmayan parçaları kuyruktan kaldırıp yeniden dene.',
    ),
    MUSIC_SOURCE_FAILED: t(
      '{song} ses kaynağı alınamadı. Bağlantının desteklenen, herkese açık bir kayıt olduğunu kontrol et.',
      { song },
    ),
  };
  return (
    messages[code] ??
    t('DJ parçası işlenemedi. Parçayı yeniden seçerek dene; sürerse bu hatayı bildir.')
  );
}
