import { t } from '../../i18n';
import { Clock3 } from 'lucide-react';

export function TurnClock({ timer }: { timer: number | null }) {
  return timer === null ? null : (
    <div className="rg-timer">
      <Clock3 size={18} />
      <b>{timer}</b>
      <span>{t('saniye')}</span>
    </div>
  );
}
