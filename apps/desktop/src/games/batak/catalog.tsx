import type { GameCatalogEntry } from '../catalog';
import { t } from '../../i18n';
import { KhCards, LobbyCards } from '../shared/catalog-art';

export const batakCatalog: GameCatalogEntry = {
  kind: 'batak',
  name: 'Batak',
  players: t('3–4 oyuncu'),
  detail: t('İhaleli, eşli, koz maça ya da gömmeli.'),
  lobbyDetail: t('4 tür · 3 veya 4 oyuncu'),
  scoring: 'points',
  section: 'cards',
  fallbackCapacity: 4,
  offered: true,
  Art: () => (
    <KhCards
      kind="batak"
      cards={[
        ['A', '♠'],
        ['Q', '♠'],
        ['10', '♥'],
        ['7', '♣'],
      ]}
    />
  ),
  LobbyArt: () => (
    <LobbyCards
      cards={[
        ['A', '♠', false],
        ['K', '♠', false],
        ['Q', '♠', false],
      ]}
    />
  ),
};
