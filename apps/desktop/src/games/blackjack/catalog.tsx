import type { GameCatalogEntry } from '../catalog';
import { t } from '../../i18n';
import { KhCards, LobbyCards } from '../shared/catalog-art';

export const blackjackCatalog: GameCatalogEntry = {
  kind: 'blackjack',
  name: 'Blackjack',
  players: t('1–7 oyuncu'),
  detail: t('Krupiyeye karşı 21. Herkes kendi elini oynar.'),
  lobbyDetail: t('Otomatik krupiye · Sanal fiş'),
  scoring: 'chips',
  section: 'cards',
  fallbackCapacity: 7,
  offered: true,
  Art: () => (
    <KhCards
      kind="blackjack"
      cards={[
        ['A', '♣'],
        ['10', '♦'],
      ]}
    >
      <span className="kh-badge">21</span>
    </KhCards>
  ),
  LobbyArt: () => (
    <LobbyCards
      cards={[
        ['A', '♠', false],
        ['K', '♥', true],
      ]}
    />
  ),
};
