import type { GameCatalogEntry } from '../catalog';
import { t } from '../../i18n';
import { KhCards, LobbyCards } from '../shared/catalog-art';

/** Not offered until the Pişti table view ships (track NG-pisti UI replaces `entry.tsx`). */
export const pistiCatalog: GameCatalogEntry = {
  kind: 'rooms-pisti-v1',
  name: t('Pişti'),
  players: t('2 veya 4 oyuncu'),
  detail: t('Yerdeki kartı aynı kartla ya da valeyle topla.'),
  lobbyDetail: t('2 veya 4 oyuncu · Puan'),
  scoring: 'points',
  section: 'cards',
  fallbackCapacity: 4,
  offered: false,
  Art: () => (
    <KhCards
      kind="rooms-pisti-v1"
      cards={[
        ['J', '♣'],
        ['7', '♥'],
      ]}
    />
  ),
  LobbyArt: () => (
    <LobbyCards
      cards={[
        ['J', '♣', false],
        ['7', '♥', true],
      ]}
    />
  ),
};
