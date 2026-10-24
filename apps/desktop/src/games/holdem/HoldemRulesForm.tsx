import { t } from '../../i18n';
import type { HoldemTableRules } from '../../../../../packages/activity-protocol/src';

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
}: {
  value: HoldemTableRules;
  onChange(value: HoldemTableRules): void;
}) {
  return (
    <div className="rg-holdem-form">
      <label className="wide">
        {t('Masa adı')}
        <input
          autoFocus
          maxLength={32}
          value={value.name}
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
            value={value[key]}
            onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })}
          />
        </label>
      ))}
      <label className="wide">
        <input
          type="checkbox"
          checked={value.spectatorsAllowed}
          onChange={(event) => onChange({ ...value, spectatorsAllowed: event.target.checked })}
        />{' '}
        {t('İzleyici kabul et')}
      </label>
      {!validHoldemRules(value) && (
        <p className="wide" role="status">
          {t('Blind ve giriş aralıklarını kontrol et. Başlangıç fişi giriş aralığında olmalı.')}
        </p>
      )}
    </div>
  );
}
