import { t } from '../../i18n';
import type { GameCreateDefinition, GameSetupValues, RuleRow } from '../registry';
import { DEFAULT_RULES, type BlackjackRulesView } from './model';

const rulesOf = (value: GameSetupValues): BlackjackRulesView => ({
  insurance: typeof value.insurance === 'boolean' ? value.insurance : DEFAULT_RULES.insurance,
  surrender: typeof value.surrender === 'boolean' ? value.surrender : DEFAULT_RULES.surrender,
});

/** The fixed house rules plus the two table switches, for the setup page and the playing table. */
export function blackjackRuleRows(rules: BlackjackRulesView): RuleRow[] {
  return [
    [t('Deste'), '6'],
    [t('Krupiye'), t('Soft 17’de durur (S17)')],
    ['Blackjack', '3:2'],
    [t('Sigorta'), rules.insurance ? t('Açık · Krupiye As gösterince · 2:1') : t('Kapalı')],
    [t('Teslim'), rules.surrender ? t('Açık · İlk iki kartta bahsin yarısı geri') : t('Kapalı')],
    ['Double', t('İlk iki kartta')],
    ['Split', t('Aynı puan değeri · En fazla 4 el')],
    [t('Split As'), t('Tek kart · yeniden ayırma kapalı')],
    [t('Bahis'), t('En az 2 · çift sayı')],
  ];
}

const SWITCHES = [
  {
    key: 'insurance',
    label: t('Sigorta'),
    on: t('Krupiye As gösterince her oyuncuya sorulur, 2:1 öder'),
    off: t('Sigorta sorulmaz'),
  },
  {
    key: 'surrender',
    label: t('Teslim'),
    on: t('İlk iki kartta el bırakılır, bahsin yarısı geri gelir'),
    off: t('El sonuna kadar oynanır'),
  },
] as const;

/** Blackjack table setup: the insurance and late-surrender switches (`blackjackModule.parseOptions`). */
export const blackjackCreate: GameCreateDefinition = {
  defaults: { ...DEFAULT_RULES },
  title: t('Blackjack masası'),
  subtitle: t('Masa kurallarını seç'),
  Options: ({ value, onChange }) => (
    <>
      {SWITCHES.map((item) => {
        const current = rulesOf(value)[item.key];
        return (
          <div
            key={item.key}
            className="rx-create-options two"
            role="group"
            aria-label={item.label}
          >
            {([true, false] as const).map((option) => (
              <button
                key={String(option)}
                className={current === option ? 'selected' : ''}
                aria-pressed={current === option}
                onClick={() => onChange({ [item.key]: option })}
              >
                <strong>
                  {item.label} · {option ? t('Açık') : t('Kapalı')}
                </strong>
                <small>{option ? item.on : item.off}</small>
              </button>
            ))}
          </div>
        );
      })}
    </>
  ),
  summary: (value) => [
    [t('Oyuncu'), t('1–7 · Herkes krupiyeye karşı')],
    [t('Sigorta'), rulesOf(value).insurance ? t('Açık') : t('Kapalı')],
    [t('Teslim'), rulesOf(value).surrender ? t('Açık') : t('Kapalı')],
  ],
  rules: (value) => blackjackRuleRows(rulesOf(value)),
  command: (value) => ({ options: { ...rulesOf(value) } }),
};
