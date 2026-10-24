import type { GameCatalogEntry } from '../catalog';
import { t } from '../../i18n';
import { LobbyCards } from '../shared/catalog-art';

const POINT_WIDTH = 10.5;
const halfPoints = (left: number) =>
  Array.from({ length: 6 }, (_, i) => ({ x: left + i * POINT_WIDTH, light: i % 2 === 0 }));

/** A small board seen from above: two halves of triangles, the bar and two dice. */
function TavlaArt() {
  const halves = [halfPoints(9), halfPoints(78)];
  const pips = (x: number, y: number, spots: [number, number][]) =>
    spots.map(([dx, dy]) => <circle key={`${dx}${dy}`} cx={x + dx} cy={y + dy} r="1.7" />);
  return (
    <span className="kh-art rooms-tavla-v1" aria-hidden="true">
      <svg width="150" height="96" viewBox="0 0 150 96" role="presentation">
        <rect x="2" y="4" width="146" height="88" rx="7" fill="#5a3a28" />
        <rect x="6" y="8" width="138" height="80" rx="4" fill="#2a1d17" />
        {halves.map((half, h) =>
          half.map(({ x, light }, i) => (
            <g key={`${h}-${i}`}>
              <polygon
                points={`${x},9 ${x + POINT_WIDTH},9 ${x + POINT_WIDTH / 2},44`}
                fill={light ? '#e2c796' : '#a8454c'}
              />
              <polygon
                points={`${x},87 ${x + POINT_WIDTH},87 ${x + POINT_WIDTH / 2},52`}
                fill={light ? '#a8454c' : '#e2c796'}
              />
            </g>
          )),
        )}
        <rect x="72" y="8" width="6" height="80" fill="#5a3a28" />
        <g transform="rotate(-12 100 48)">
          <rect x="92" y="40" width="16" height="16" rx="3" fill="#f7f4ee" />
          <g fill="#1d1d24">
            {pips(92, 40, [
              [4, 4],
              [12, 12],
              [8, 8],
            ])}
          </g>
        </g>
        <g transform="rotate(9 122 56)">
          <rect x="114" y="48" width="16" height="16" rx="3" fill="#f7f4ee" />
          <g fill="#c2283e">
            {pips(114, 48, [
              [4, 4],
              [12, 12],
              [4, 12],
              [12, 4],
            ])}
          </g>
        </g>
      </svg>
    </span>
  );
}

/** Two-player Tavla played as a match to 3, 5 or 7 points (`entry.tsx` has the table). */
export const tavlaCatalog: GameCatalogEntry = {
  kind: 'rooms-tavla-v1',
  name: 'Tavla',
  players: t('2 oyuncu'),
  detail: t('Zarı at, pullarını topla. Maç sayıya oynanır.'),
  lobbyDetail: t('2 oyuncu · Maç'),
  scoring: 'points',
  section: 'tables',
  fallbackCapacity: 2,
  offered: true,
  Art: () => <TavlaArt />,
  LobbyArt: () => (
    <LobbyCards
      cards={[
        ['6', '⚅', false],
        ['3', '⚂', false],
      ]}
    />
  ),
};
