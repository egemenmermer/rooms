import { t } from '../../i18n';
import type { GameCreateDefinition, RuleRow } from '../registry';

type Scoring = 'countdown' | 'winner';
const scoringOf = (value: unknown): Scoring => (value === 'winner' ? 'winner' : 'countdown');

/** Rule rows shared by the setup page and the table ("Masa kuralları"). */
export function okeyScoringRows(scoring: Scoring, startingPoints = 20): RuleRow[] {
  return scoring === 'winner'
    ? [[t('Puan'), t('Kazanan +1 · Diğerlerine puan yazılmaz')]]
    : [
        [t('Puan'), t('Herkes {points} puanla başlar', { points: startingPoints })],
        [t('Bitiren'), t('Diğerlerinden 2 düşer')],
        [t('Okey atarak bitirme'), t('İki kat')],
        [t('Çifte gitme'), t('İki kat')],
        [t('Gösterge'), t('İlk turda gösterene diğerlerinden 1 düşer')],
      ];
}

export const okeyCreate: GameCreateDefinition = {
  defaults: { scoring: 'countdown' },
  title: t('Okey masası'),
  subtitle: t('Puan türünü seç.'),
  Options: ({ value, onChange }) => (
    <div className="rx-create-options two">
      {(['countdown', 'winner'] as const).map((option) => (
        <button
          type="button"
          className={scoringOf(value.scoring) === option ? 'selected' : ''}
          key={option}
          onClick={() => onChange({ scoring: option })}
        >
          <strong>{option === 'countdown' ? t('Geri sayım') : t('Kazanan +1')}</strong>
          <small>
            {option === 'countdown'
              ? t('Herkes 20 ile başlar, bitiren diğerlerinden düşer')
              : t('Düz puan tablosu: bitiren 1 puan alır')}
          </small>
        </button>
      ))}
    </div>
  ),
  summary: (value) => [
    [t('Oyuncu'), '4'],
    [t('Puan'), scoringOf(value.scoring) === 'winner' ? t('Kazanan +1') : t('Geri sayım')],
  ],
  rules: (value) => [
    [t('Oyuncu'), '4'],
    [t('Dağıtım'), t('Başlayan 15, diğerleri 14 taş')],
    ['Okey', t('Göstergenin bir üstü · Sahte okey onun yerine geçer')],
    [t('Bitirme'), t('14 taş per ya da 7 çift, 15. taş ortaya atılır')],
    ...okeyScoringRows(scoringOf(value.scoring)),
  ],
  command: (value) => ({ options: { scoring: scoringOf(value.scoring) } }),
};
