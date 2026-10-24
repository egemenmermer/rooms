import type { GameCatalogEntry } from '../catalog';
import { t } from '../../i18n';
import { KhCards, LobbyCards } from '../shared/catalog-art';

export const holdemCatalog: GameCatalogEntry = {
  kind: 'holdem',
  name: 'Texas Hold’em',
  players: t('2–9 oyuncu'),
  detail: t('Blind, flop ve showdown. Sanal fişle.'),
  lobbyDetail: t('2–9 oyuncu · Sanal fiş'),
  scoring: 'chips',
  section: 'cards',
  fallbackCapacity: 9,
  offered: true,
  Art: () => (
    <KhCards
      kind="holdem"
      cards={[
        ['A', '♠'],
        ['K', '♥'],
      ]}
    >
      <span className="kh-chips">
        <i />
        <i />
        <i />
      </span>
    </KhCards>
  ),
  LobbyArt: () => (
    <LobbyCards
      cards={[
        ['A', '♠', false],
        ['K', '♥', true],
      ]}
    >
      <i>100</i>
    </LobbyCards>
  ),
};
