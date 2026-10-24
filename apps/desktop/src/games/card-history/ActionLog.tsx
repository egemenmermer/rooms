import { t } from '../../i18n';
import type { GameHistoryEntry } from '../registry';
import { array, object } from '../shared/model';
import './action-log.css';

const streets: Record<string, string> = {
  preflop: t('Preflop'),
  flop: t('Flop'),
  turn: t('Turn'),
  river: t('River'),
};

/** One recorded move as a sentence; unknown shapes fall back to the plain action name. */
function describe(item: Record<string, unknown>, name: string) {
  const amount = Number(item.amount ?? 0),
    to = Number(item.to ?? 0),
    allIn = item.allIn === true;
  switch (item.action) {
    case 'smallBlind':
      return t('{name} küçük kör koydu · {amount}', { name, amount });
    case 'bigBlind':
      return t('{name} büyük kör koydu · {amount}', { name, amount });
    case 'fold':
      return t('{name} bıraktı', { name });
    case 'check':
      return t('{name} kontrol etti', { name });
    case 'call':
      return allIn
        ? t('{name} gördü · {amount} · all-in', { name, amount })
        : t('{name} gördü · {amount}', { name, amount });
    case 'raise':
      return allIn
        ? t('{name} {to} yaptı · all-in', { name, to })
        : t('{name} {to} yaptı', { name, to });
    default:
      return t('{name} · {action}', { name, action: String(item.action ?? '') });
  }
}

/**
 * The public moves of a finished hand (`result.actions`, recorded by Hold'em) grouped by street,
 * plus the players who mucked at showdown. Renders nothing for a hand without them.
 */
export function ActionLog({ entry }: { entry: GameHistoryEntry }) {
  const actions = array<unknown>(entry.result.actions).map(object),
    mucked = array<string>(entry.result.mucked);
  if (!actions.length && !mucked.length) return null;
  const name = (id: unknown) =>
    entry.seats?.find((seat) => seat.userId === id)?.name ?? t('Katılımcı');
  const groups: { street: string; items: Record<string, unknown>[] }[] = [];
  for (const item of actions) {
    const street = String(item.street ?? '');
    const last = groups[groups.length - 1];
    if (last && last.street === street) last.items.push(item);
    else groups.push({ street, items: [item] });
  }
  return (
    <section className="rh-action-log" aria-label={t('El hamleleri')}>
      <h4>{t('Hamleler')}</h4>
      {groups.map((group, index) => (
        <div key={`${group.street}:${index}`}>
          {group.street && <strong>{streets[group.street] ?? group.street}</strong>}
          <ol>
            {group.items.map((item, position) => (
              <li key={position}>{describe(item, name(item.userId))}</li>
            ))}
          </ol>
        </div>
      ))}
      {mucked.length > 0 && (
        <p>{t('Kartlarını göstermeyenler: {names}', { names: mucked.map(name).join(', ') })}</p>
      )}
    </section>
  );
}
