/** User-facing playback failures; never display raw provider diagnostics or credentials. */
export function musicPlaybackError(code: string, title?: string) {
  const song = title ? `“${title.slice(0, 160)}”` : 'Parça';
  const messages: Record<string, string> = {
    MUSIC_YOUTUBE_ACCESS_REQUIRED: `${song} için YouTube ses erişimini reddetti. DJ sunucu oturumu kontrol edilmeli; tekrar tekrar eklemek bu engeli çözmez.`,
    MUSIC_YOUTUBE_UNAVAILABLE: `${song} YouTube’dan alınamadı. Video kaldırılmış, bölgeye kapalı veya geçici olarak erişilemiyor olabilir.`,
    MUSIC_SOURCE_TIMEOUT: `${song} yüklenirken süre doldu. Yeniden dene; sürerse başka bir kayıt seç.`,
    MUSIC_DECODE_FAILED: `${song} bulundu ancak ses akışı başlatılamadı veya kesildi. Parçayı yeniden seçerek dene.`,
    MUSIC_TRANSPORT_UNAVAILABLE:
      'DJ ses odasına bağlanamadı. Oda bağlantısını kontrol edip yeniden dene.',
    MUSIC_HISTORY_UNAVAILABLE: 'Müzik bağlantısı korunuyor, ancak DJ geçmişi kaydedilemedi.',
    MUSIC_CACHE_LIMIT:
      'DJ’nin geçici ses alanı doldu. Kullanılmayan parçaları kuyruktan kaldırıp yeniden dene.',
    MUSIC_SOURCE_FAILED: `${song} ses kaynağı alınamadı. Bağlantının desteklenen, herkese açık bir kayıt olduğunu kontrol et.`,
  };
  return (
    messages[code] ??
    'DJ parçası işlenemedi. Parçayı yeniden seçerek dene; sürerse bu hatayı bildir.'
  );
}
