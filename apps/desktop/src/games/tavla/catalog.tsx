import type { GameCatalogEntry } from '../catalog';
import { t } from '../../i18n';
import { LobbyCards } from '../shared/catalog-art';

/** Not offered until the Tavla board view ships (track NG-tavla UI replaces `entry.tsx`). */
export const tavlaCatalog: GameCatalogEntry = {
  kind: 'rooms-tavla-v1',
  name: 'Tavla',
  players: t('2 oyuncu'),
  detail: t('Zarı at, pullarını topla. Maç sayıya oynanır.'),
  lobbyDetail: t('2 oyuncu · Maç'),
  scoring: 'points',
  section: 'tables',
  fallbackCapacity: 2,
  offered: false,
  Art: () => (
    <span className="kh-art rooms-tavla-v1" aria-hidden="true">
      <i className="kh-card">⚄</i>
      <i className="kh-card">⚂</i>
    </span>
  ),
  LobbyArt: () => (
    <LobbyCards
      cards={[
        ['6', '⚅', false],
        ['3', '⚂', false],
      ]}
    />
  ),
};
