import { t } from './i18n';

/** Classify only observed transport/media evidence; an opaque failure is not an expired account. */
export type PersonalPlaybackFailure =
  'expired' | 'unauthorized' | 'unsupported' | 'network' | 'stalled' | 'unknown';
export function playbackFailure(httpStatus?: number, mediaCode?: number): PersonalPlaybackFailure {
  if (httpStatus === 410) return 'expired';
  if (httpStatus === 401 || httpStatus === 403) return 'unauthorized';
  if (mediaCode === 3 || mediaCode === 4) return 'unsupported';
  if (mediaCode === 2 || (httpStatus !== undefined && httpStatus >= 400)) return 'network';
  return 'unknown';
}
export const playbackFailureCopy: Record<
  PersonalPlaybackFailure,
  { title: string; message: string }
> = {
  expired: {
    title: t('Oynatma bağlantısının süresi doldu'),
    message: t('Kaynağı listesinden yeniden aç.'),
  },
  unauthorized: {
    title: t('Kaynak erişimi reddedildi'),
    message: t('Kişisel bağlantının yetkilendirmesini kontrol et.'),
  },
  unsupported: {
    title: t('Bu medya biçimi oynatılamıyor'),
    message: t('Kaynak desteklenen bir ses ve video biçimi sunmuyor.'),
  },
  network: {
    title: t('Kaynağa ulaşılamıyor'),
    message: t('Bağlantını kontrol edip yeniden dene.'),
  },
  stalled: {
    title: t('Yayın ilerlemiyor'),
    message: t('Yeni görüntü gelmedi. Yayını yeniden açmayı dene.'),
  },
  unknown: {
    title: t('Kaynak oynatılamadı'),
    message: t(
      'Tayfa bu yayını açamadı; hata nedeni belirlenemedi. Oynatma seçeneklerinden başka bir oynatıcıyla kontrol edebilirsin.',
    ),
  },
};
