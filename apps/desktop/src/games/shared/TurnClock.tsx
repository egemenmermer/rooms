import { t } from '../../i18n';
import { Clock3 } from 'lucide-react';

/** No game gives a move more than this; a longer clock is a garbage or skewed deadline. */
export const MAX_TURN_SECONDS = 600;

/**
 * The seconds a clock may show: a whole number from 0 up, or `null` (draw nothing) when no clock
 * runs or the value cannot be a real turn time (far-future deadline, NaN, Infinity).
 */
export function guardTimer(timer: number | null | undefined): number | null {
  if (timer === null || timer === undefined || Number.isNaN(timer)) return null;
  if (timer > MAX_TURN_SECONDS) return null;
  return Math.max(0, Math.floor(timer));
}

export function TurnClock({ timer }: { timer: number | null }) {
  const seconds = guardTimer(timer);
  if (seconds === null) return null;
  return (
    <div className={`rg-timer${seconds === 0 ? ' expired' : ''}`}>
      <Clock3 size={18} />
      {seconds === 0 ? (
        <span>{t('Süre doldu')}</span>
      ) : (
        <>
          <b>{seconds}</b>
          <span>{t('saniye')}</span>
        </>
      )}
    </div>
  );
}
