import { tr } from '../../i18n';
import { rankNames, suitNames, suits, type Card } from './model';

export function PlayingCard({
  card,
  selected,
  winning,
  onClick,
  disabled,
}: {
  card?: Card;
  selected?: boolean;
  winning?: boolean;
  onClick?(): void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || !onClick}
      className={`playing-card ${!card ? 'back' : ''} ${card && ['hearts', 'diamonds'].includes(card.suit) ? 'red' : ''} ${selected ? 'selected' : ''} ${winning ? 'winning' : ''}`}
      aria-pressed={onClick ? !!selected : undefined}
      aria-label={
        card
          ? `${suitNames[card.suit] ?? card.suit} ${rankNames[card.rank] ?? card.rank}`
          : tr('Kapal\u0131 kart')
      }
      onClick={onClick}
    >
      {card ? (
        <>
          <span>
            {({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[card.rank] ??
              card.rank}
            <i>{suits[card.suit]}</i>
          </span>
          <b>{suits[card.suit]}</b>
        </>
      ) : (
        <span className="card-back-mark">{tr('r.')}</span>
      )}
    </button>
  );
}
