import { Coins } from 'lucide-react';
import { t } from '../../i18n';
import type { BuyInDefinition } from '../registry';

/** Virtual chips a player brings to a Hold'em seat, inside the lobby's "Masaya katıl" dialog. */
export const holdemBuyIn: BuyInDefinition = {
  initial: (game) => game.view.rules?.initialChips ?? 1000,
  valid: (game, value) => {
    const rules = game.view.rules;
    return (
      !!rules && Number.isInteger(value) && value >= rules.minBuyIn && value <= rules.maxBuyIn
    );
  },
  Field: ({ game, value, onChange }) => {
    const rules = game.view.rules;
    return (
      <>
        <div className="rg-buy-in">
          <Coins size={28} />
          <strong>{t('Sanal fiş')}</strong>
        </div>
        <label>
          {t('Giriş miktarı')}
          <input
            autoFocus
            type="number"
            min={rules?.minBuyIn}
            max={rules?.maxBuyIn}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        </label>
        <p>
          {rules
            ? t('{minBuyIn} – {maxBuyIn} sanal fiş', {
                minBuyIn: rules.minBuyIn,
                maxBuyIn: rules.maxBuyIn,
              })
            : t('Masa giriş kuralları henüz alınmadı.')}
        </p>
        {game.status === 'playing' && <p>{t('Bu el dağıtıldı. Sonraki elde oynayacaksın.')}</p>}
      </>
    );
  },
};
