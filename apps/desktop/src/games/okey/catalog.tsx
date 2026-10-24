import type { GameCatalogEntry } from '../catalog';
import { t } from '../../i18n';
import { KhTiles, LobbyTiles } from '../shared/catalog-art';

/** Classic Okey: the table view lives in `entry.tsx`. */
export const okeyCatalog: GameCatalogEntry = {
  kind: 'rooms-okey-v1',
  name: 'Okey',
  players: t('4 oyuncu'),
  detail: t('Klasik Okey: 14 taşı per ya da çift olarak diz.'),
  lobbyDetail: t('4 oyuncu · Klasik'),
  scoring: 'points',
  section: 'tables',
  fallbackCapacity: 4,
  offered: true,
  Art: () => (
    <KhTiles
      tiles={[
        ['3', 'red'],
        ['4', 'red'],
        ['5', 'red'],
        ['★', 'joker'],
      ]}
    />
  ),
  LobbyArt: () => <LobbyTiles numbers={[3, 4, 5]} />,
};
