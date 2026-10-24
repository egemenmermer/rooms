import { getLocale } from '../i18n';

/**
 * Development fixtures speak the interface language, so English screenshots and recordings show
 * English sample data. Tests pin Turkish, so fixtures stay Turkish there.
 */
export function sample<T>(tr: T, en: T): T {
  return getLocale() === 'en' ? en : tr;
}

/** The sample crew. Every fixture uses these so one person keeps one name across surfaces. */
export const people = {
  deniz: sample('Deniz', 'Maya'),
  ece: sample('Ece', 'Emma'),
  can: sample('Can', 'Leo'),
  zeynep: sample('Zeynep', 'Zoe'),
  mert: sample('Mert', 'Max'),
};

/** Sample places shared by the sidebar, voice and chat fixtures. */
export const places = {
  community: sample('Bizim Oda', 'Our Place'),
  lounge: sample('Salon', 'Lounge'),
  quietCorner: sample('Sessiz köşe', 'Quiet corner'),
  general: sample('genel', 'general'),
  gameTable: sample('oyun-masası', 'game-table'),
  shares: sample('paylasimlar', 'shares'),
  movieNight: sample('film-gecesi', 'movie-night'),
};
