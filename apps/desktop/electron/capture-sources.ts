import { t } from '@rooms/i18n';
export class CaptureSourcesError extends Error {}
type Options = {
  types: ('screen' | 'window')[];
  thumbnailSize: { width: number; height: number };
  fetchWindowIcons: boolean;
};
/** A thumbnail failure must not prevent an explicit source selection. No source is auto-selected. */
export async function enumerateCaptureSources<T extends { id: string }>(
  getSources: (options: Options) => Promise<T[]>,
  screenPermission: () => string,
): Promise<T[]> {
  const permissionMessage = t(
    'macOS ekran kaydı izni kapalı. Sistem Ayarları → Gizlilik ve Güvenlik → Ekran ve Sistem Sesi Kaydı bölümünden Tayfa’ya izin ver; ardından uygulamayı yeniden aç.',
  );
  if (['denied', 'restricted'].includes(screenPermission()))
    throw new CaptureSourcesError(permissionMessage);
  try {
    return await getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: false,
    });
  } catch {
    if (['denied', 'restricted'].includes(screenPermission()))
      throw new CaptureSourcesError(permissionMessage);
    const sources: T[] = [];
    for (const type of ['screen', 'window'] as const) {
      try {
        sources.push(
          ...(await getSources({
            types: [type],
            thumbnailSize: { width: 0, height: 0 },
            fetchWindowIcons: false,
          })),
        );
      } catch {
        /* Retain accessible sources of the other type. */
      }
    }
    if (!sources.length)
      throw new CaptureSourcesError(
        t(
          'Ekran ve pencere listesi macOS tarafından alınamadı. Ekran kaydı iznini kontrol et; izin açıksa Tayfa’yı normal şekilde kapatıp yeniden aç.',
        ),
      );
    return [...new Map(sources.map((source) => [source.id, source])).values()];
  }
}
