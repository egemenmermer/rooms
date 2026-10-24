import { t } from '../../i18n';
import type { HoldemTableRules } from '../../../../../packages/activity-protocol/src';
import type { GameSetupValues, TableRulesDefinition } from '../registry';
import { holdemViewRules } from './model';

export const holdemRuleDefaults: HoldemTableRules = {
  name: 'Texas Hold’em',
  capacity: 6,
  smallBlind: 10,
  bigBlind: 20,
  minBuyIn: 200,
  maxBuyIn: 2000,
  initialChips: 1000,
  spectatorsAllowed: true,
};

/** The form keeps the table rules plus the house rule `muckLosers` (sent in `game.create.options`). */
export const holdemRulesOf = (value: GameSetupValues): HoldemTableRules => ({
  name: String(value.name ?? ''),
  capacity: Number(value.capacity),
  smallBlind: Number(value.smallBlind),
  bigBlind: Number(value.bigBlind),
  minBuyIn: Number(value.minBuyIn),
  maxBuyIn: Number(value.maxBuyIn),
  initialChips: Number(value.initialChips),
  spectatorsAllowed: value.spectatorsAllowed !== false,
});

export function validHoldemRules(value: HoldemTableRules) {
  return (
    value.name.trim().length > 0 &&
    value.name.trim().length <= 32 &&
    Number.isInteger(value.capacity) &&
    value.capacity >= 2 &&
    value.capacity <= 9 &&
    [value.smallBlind, value.bigBlind, value.minBuyIn, value.maxBuyIn, value.initialChips].every(
      (number) => Number.isInteger(number) && number > 0 && number <= 1000000,
    ) &&
    value.smallBlind <= 100000 &&
    value.bigBlind <= 100000 &&
    value.smallBlind <= value.bigBlind &&
    value.minBuyIn >= value.bigBlind &&
    value.maxBuyIn >= value.minBuyIn &&
    value.initialChips >= value.minBuyIn &&
    value.initialChips <= value.maxBuyIn
  );
}
export function HoldemRulesForm({
  value,
  onChange,
  editing = false,
}: {
  value: GameSetupValues;
  onChange(value: GameSetupValues): void;
  /** The waiting table's "Düzenle": `game.configure` cannot change house rules. */
  editing?: boolean;
}) {
  const rules = holdemRulesOf(value);
  return (
    <div className="rg-holdem-form">
      <label className="wide">
        {t('Masa adı')}
        <input
          autoFocus
          maxLength={32}
          value={rules.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </label>
      {(
        [
          ['capacity', t('Koltuk sayısı'), 2, 9],
          ['smallBlind', 'Small blind', 1, 100000],
          ['bigBlind', 'Big blind', 1, 100000],
          ['minBuyIn', t('Minimum giriş'), 1, 1000000],
          ['maxBuyIn', t('Maksimum giriş'), 1, 1000000],
          ['initialChips', t('Başlangıç fişi'), 1, 1000000],
        ] as const
      ).map(([key, label, min, max]) => (
        <label key={key}>
          {label}
          <input
            type="number"
            min={min}
            max={max}
            value={rules[key]}
            onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })}
          />
        </label>
      ))}
      <label className="wide">
        <input
          type="checkbox"
          checked={rules.spectatorsAllowed}
          onChange={(event) => onChange({ ...value, spectatorsAllowed: event.target.checked })}
        />{' '}
        {t('İzleyici kabul et')}
      </label>
      {editing ? (
        <p className="wide ho-form-note">{t('Kaybedenin kartı kuralı masa kurulurken seçilir.')}</p>
      ) : (
        <label className="wide">
          <input
            type="checkbox"
            checked={value.muckLosers === true}
            onChange={(event) => onChange({ ...value, muckLosers: event.target.checked })}
          />{' '}
          {t('Kaybeden kartını açmasın')}
          <small className="ho-form-note">
            {t(
              'Showdown’da pot alamayan oyuncunun kartları kapalı kalır. Biri all-in ise bütün eller açılır.',
            )}
          </small>
        </label>
      )}
      {!validHoldemRules(rules) && (
        <p className="wide" role="status">
          {t('Blind ve giriş aralıklarını kontrol et. Başlangıç fişi giriş aralığında olmalı.')}
        </p>
      )}
    </div>
  );
}

/** Hold'em's rules in the lobby's create dialog and the owner's "Düzenle" before the first hand. */
export const holdemTableRules: TableRulesDefinition = {
  initial: (game) => {
    if (!game) return { ...holdemRuleDefaults };
    const rules = holdemViewRules(game);
    return rules ? { ...rules } : null;
  },
  Form: HoldemRulesForm,
  valid: (value) => validHoldemRules(holdemRulesOf(value)),
  command: (value) => ({
    holdem: holdemRulesOf(value),
    ...(value.muckLosers === true ? { options: { muckLosers: true } } : {}),
  }),
  configure: (value) => ({ type: 'game.configure', holdem: holdemRulesOf(value) }),
};
