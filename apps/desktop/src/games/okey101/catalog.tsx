import type { GameCatalogEntry } from '../catalog';
import { t } from '../../i18n';
import { KhTiles, LobbyTiles } from '../shared/catalog-art';

export const okey101Catalog: GameCatalogEntry = {
  kind: '101',
  name: '101 Okey',
  players: t('4 oyuncu'),
  detail: t('Tekli ya da eşli. Botlar boş yerleri doldurur.'),
  lobbyDetail: t('4 oyuncu · Tekli veya eşli'),
  scoring: 'points',
  section: 'tables',
  fallbackCapacity: 4,
  offered: true,
  Art: () => (
    <KhTiles
      tiles={[
        ['7', 'red'],
        ['8', 'black'],
        ['9', 'blue'],
        ['★', 'joker'],
      ]}
    />
  ),
  LobbyArt: () => <LobbyTiles numbers={[10, 11, 12]} />,
};
