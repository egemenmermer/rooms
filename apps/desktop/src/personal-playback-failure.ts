/** Classify only observed transport/media evidence; an opaque failure is not an expired account. */
export type PersonalPlaybackFailure = 'expired' | 'unauthorized' | 'unsupported' | 'network' | 'unknown';
export function playbackFailure(httpStatus?: number, mediaCode?: number): PersonalPlaybackFailure {
  if (httpStatus === 410) return 'expired';
  if (httpStatus === 401 || httpStatus === 403) return 'unauthorized';
  if (mediaCode === 3 || mediaCode === 4) return 'unsupported';
  if (mediaCode === 2 || (httpStatus !== undefined && httpStatus >= 400)) return 'network';
  return 'unknown';
}
export const playbackFailureCopy: Record<PersonalPlaybackFailure, {title:string;message:string}> = {
  expired: {title:'Oynatma bağlantısının süresi doldu', message:'Kaynağı listesinden yeniden aç.'},
  unauthorized: {title:'Kaynak erişimi reddedildi', message:'Kişisel bağlantının yetkilendirmesini kontrol et.'},
  unsupported: {title:'Bu medya biçimi oynatılamıyor', message:'Kaynak desteklenen bir ses ve video biçimi sunmuyor.'},
  network: {title:'Kaynağa ulaşılamıyor', message:'Bağlantını kontrol edip yeniden dene.'},
  unknown: {title:'Kaynak oynatılamadı', message:'Kaynağını kontrol edip yeniden dene.'},
};
