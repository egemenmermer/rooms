import './kiraathane.css';
import { ArrowRight, History, Info, LoaderCircle, Users } from 'lucide-react';
import type { GamePublicState } from '../../../packages/activity-protocol/src';

type Kind = GamePublicState['kind'];
export const gameNames: Record<Kind, string> = {
  holdem: 'Texas Hold’em',
  blackjack: 'Blackjack',
  batak: 'Batak',
  '101': '101 Okey',
};
export const gameCatalog: { kind: Kind; players: string; detail: string }[] = [
  { kind: 'holdem', players: '2–9 oyuncu', detail: 'Blind, flop ve showdown. Sanal fişle.' },
  {
    kind: 'blackjack',
    players: '1–7 oyuncu',
    detail: 'Krupiyeye karşı 21. Herkes kendi elini oynar.',
  },
  { kind: 'batak', players: '3–4 oyuncu', detail: 'İhaleli, eşli, koz maça ya da gömmeli.' },
  { kind: '101', players: '4 oyuncu', detail: 'Tekli ya da eşli. Botlar boş yerleri doldurur.' },
];

export function tableCapacity(game: GamePublicState): number {
  const value = Number(
    game.view.rules?.capacity ??
      game.view.capacity ??
      (game.kind === 'blackjack' ? 7 : game.kind === 'holdem' ? 9 : 4),
  );
  return Number.isInteger(value) && value >= 1 && value <= 9 ? value : 4;
}

/** Small drawn table pieces; no photos, so the lobby keeps the app's own look. */
export function GameArt({ kind }: { kind: Kind }) {
  if (kind === '101')
    return (
      <span className="kh-art okey" aria-hidden="true">
        {[
          ['7', 'red'],
          ['8', 'black'],
          ['9', 'blue'],
          ['★', 'joker'],
        ].map(([value, tone]) => (
          <i key={value} className={`kh-tile ${tone}`}>
            {value}
          </i>
        ))}
      </span>
    );
  const cards: [string, string][] =
    kind === 'holdem'
      ? [
          ['A', '♠'],
          ['K', '♥'],
        ]
      : kind === 'blackjack'
        ? [
            ['A', '♣'],
            ['10', '♦'],
          ]
        : [
            ['A', '♠'],
            ['Q', '♠'],
            ['10', '♥'],
            ['7', '♣'],
          ];
  return (
    <span className={`kh-art ${kind}`} aria-hidden="true">
      {cards.map(([rank, suit]) => (
        <i key={rank + suit} className={`kh-card ${'♥♦'.includes(suit) ? 'red' : ''}`}>
          <b>{rank}</b>
          {suit}
        </i>
      ))}
      {kind === 'holdem' && (
        <span className="kh-chips">
          <i />
          <i />
          <i />
        </span>
      )}
      {kind === 'blackjack' && <span className="kh-badge">21</span>}
    </span>
  );
}

export function Kiraathane({
  game,
  ready,
  error,
  blocked,
  busy,
  otherActivity,
  onCreate,
  onOpen,
  onHistory,
  onRetry,
}: {
  game: GamePublicState | null;
  ready: boolean;
  error: string | null;
  /** Why this person cannot open tables at all (e.g. no permission). */
  blocked: string;
  busy: boolean;
  /** A non-game activity (cinema, YouTube…) that a new table would replace. */
  otherActivity: string | null;
  onCreate(kind: Kind): void;
  onOpen(): void;
  onHistory(): void;
  onRetry(): void;
}) {
  const status =
    game?.status === 'waiting'
      ? 'Oyuncu bekliyor'
      : game?.status === 'finished'
        ? 'El bitti, yenisi başlayabilir'
        : 'Oynanıyor';
  const reason = !ready ? 'Masa bağlantısı bekleniyor.' : blocked;
  return (
    <section className="kh" aria-label="Kıraathane">
      <header className="kh-head">
        <div>
          <h1>Kıraathane</h1>
          <p>Arkadaşlarınla sanal fişle oyna. Odada aynı anda bir masa açık olur.</p>
        </div>
        <button className="button secondary" onClick={onHistory}>
          <History size={16} />
          Geçmiş
        </button>
      </header>
      {error && (
        <div className="kh-note error" role="alert">
          {error}
          <button className="button secondary small" onClick={onRetry} disabled={busy}>
            Yeniden dene
          </button>
        </div>
      )}
      {!ready && !error && (
        <div className="kh-note" role="status">
          <LoaderCircle size={15} className="spin" />
          Masalar yükleniyor…
        </div>
      )}
      {game && (
        <article className="kh-open">
          <GameArt kind={game.kind} />
          <div className="kh-open-text">
            <small>Açık masa</small>
            <strong>
              {typeof game.view.tableName === 'string' && game.view.tableName
                ? game.view.tableName
                : gameNames[game.kind]}
            </strong>
            <span>
              {gameNames[game.kind]} · {status}
            </span>
          </div>
          <div
            className="kh-seats"
            aria-label={`${game.seats.length} / ${tableCapacity(game)} oyuncu`}
          >
            {game.seats.slice(0, 6).map((seat) => (
              <span key={seat.seat} title={seat.name} className={seat.bot ? 'bot' : ''}>
                {seat.bot ? 'B' : seat.name.trim().slice(0, 1).toLocaleUpperCase('tr')}
              </span>
            ))}
            <em>
              <Users size={13} />
              {game.seats.length}/{tableCapacity(game)}
            </em>
          </div>
          <button className="button primary" onClick={onOpen}>
            Masaya geç
            <ArrowRight size={16} />
          </button>
        </article>
      )}
      {otherActivity && !game && (
        <div className="kh-note">
          <Info size={15} />
          Odada {otherActivity} açık. Masa açınca o etkinlik herkes için kapanır; bunu etkinliğin
          hostu yapabilir.
        </div>
      )}
      <div className="kh-grid">
        {gameCatalog.map((item) => {
          const open = game?.kind === item.kind;
          return (
            <article key={item.kind} className={`kh-game ${open ? 'is-open' : ''}`}>
              <div className="kh-felt">
                <GameArt kind={item.kind} />
              </div>
              <div className="kh-game-body">
                <h2>{gameNames[item.kind]}</h2>
                <p>{item.detail}</p>
                <div className="kh-tags">
                  <span>{item.players}</span>
                  <span>{item.kind === '101' || item.kind === 'batak' ? 'Puan' : 'Sanal fiş'}</span>
                </div>
              </div>
              <button
                className={`button ${open ? 'primary' : game ? 'secondary' : 'primary'}`}
                disabled={!open && (!!reason || busy)}
                title={!open && reason ? reason : undefined}
                onClick={() => (open ? onOpen() : onCreate(item.kind))}
              >
                {open ? 'Masaya geç' : game ? 'Bu oyuna geç' : 'Masa aç'}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
