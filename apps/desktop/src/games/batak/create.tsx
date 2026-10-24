import { t } from '../../i18n';
import type { GameCreateDefinition, GameSetupValues } from '../registry';
import { BATAK_RULE_DEFAULTS, type BatakVariant } from './model';

const variantOf = (value: GameSetupValues) => String(value.variant) as BatakVariant;
const modes = () =>
  [
    ['ihaleli', t('İhaleli'), '♣', t('4 oyuncu · Tekli')],
    ['esli', t('Eşli'), '♠', t('4 oyuncu · 2 + 2')],
    ['koz-maca', t('Koz Maça'), '♠', t('4 oyuncu · Sabit koz')],
    ['gommeli', t('Gömmeli'), '♦', t('3 oyuncu · 4 kart gömme')],
  ] as const;
const count = (value: GameSetupValues) => (variantOf(value) === 'gommeli' ? 3 : 4);

/** House rules (`BatakRules` in packages/games/src/batak.ts); keys go to `game.create.options` as-is. */
type RuleKey = keyof typeof BATAK_RULE_DEFAULTS;
const ruleOf = (value: GameSetupValues, key: RuleKey) =>
  typeof value[key] === 'boolean' ? (value[key] as boolean) : BATAK_RULE_DEFAULTS[key];
/** The scoring switches do not apply to Koz Maça, which scores every seat's own call. */
const scoringRule = (key: RuleKey) => key !== 'noTrumpLeadUntilBroken';
const ruleTexts = () =>
  [
    [
      'noTrumpLeadUntilBroken',
      t('Koz kırılmadan koz açılmaz'),
      t('Koz başka renge atılana kadar elde başka renk varken koz açılamaz.'),
    ],
    [
      'defenderBatakPenalty',
      t('Savunma batağı'),
      t('Hiç el almayan savunma oyuncusu ihale kadar eksi yazar.'),
    ],
    [
      'writeContract',
      t('İhale kadar yaz'),
      t('İhaleyi çıkaran aldığı el yerine ihale kadar yazar.'),
    ],
  ] as const;
const yes = (on: boolean) => (on ? t('Açık') : t('Kapalı'));

export const batakCreate: GameCreateDefinition = {
  defaults: { variant: 'ihaleli', ...BATAK_RULE_DEFAULTS },
  title: t('Hangi Batak?'),
  subtitle: t('Batak türünü ve masa kurallarını seç.'),
  Options: ({ value, onChange }) => (
    <>
      <div className="rx-create-options" role="group" aria-label={t('Batak türü')}>
        {modes().map(([id, label, symbol, detail]) => (
          <button
            key={id}
            className={variantOf(value) === id ? 'selected' : ''}
            aria-pressed={variantOf(value) === id}
            onClick={() => onChange({ variant: id })}
          >
            <span>{symbol}</span>
            <strong>{label}</strong>
            <small>{detail}</small>
          </button>
        ))}
      </div>
      <div className="rx-create-options" role="group" aria-label={t('Masa kuralları')}>
        {ruleTexts().map(([key, label, detail]) => {
          const off = variantOf(value) === 'koz-maca' && scoringRule(key),
            on = ruleOf(value, key);
          return (
            <button
              key={key}
              className={on && !off ? 'selected' : ''}
              aria-pressed={on && !off}
              disabled={off}
              title={off ? t('Koz Maça her oyuncunun kendi tahminiyle yazılır.') : undefined}
              onClick={() => onChange({ [key]: !on })}
            >
              <span>{on && !off ? '✓' : '—'}</span>
              <strong>{label}</strong>
              <small>{off ? t('Koz Maça’da geçerli değil') : detail}</small>
            </button>
          );
        })}
      </div>
    </>
  ),
  summary: (value) => {
    const variant = variantOf(value);
    return [
      [t('Oyuncu'), String(count(value))],
      [t('Tür'), modes().find((mode) => mode[0] === variant)?.[1] ?? ''],
      [
        t('Akış'),
        variant === 'gommeli'
          ? t('İhale · Koz · Gömme · Oyun')
          : variant === 'koz-maca'
            ? t('Tahmin · Oyun')
            : t('İhale · Koz · Oyun'),
      ],
      [t('Koz kırılmadan koz açılmaz'), yes(ruleOf(value, 'noTrumpLeadUntilBroken'))],
    ];
  },
  rules: (value) => {
    const variant = variantOf(value);
    return [
      [t('Oyuncu'), String(count(value))],
      [
        t('İhale'),
        variant === 'koz-maca'
          ? t('Her oyuncu 1–13 tahmin verir')
          : variant === 'esli' || variant === 'gommeli'
            ? t('En az 8')
            : t('En az 5'),
      ],
      [t('Renge uyma'), t('Zorunlu · Mümkünse yükselt')],
      [t('Gömmeli'), t('Koz seçimi sonrası 4 kart gömülür')],
      ...ruleTexts().map(([key, label]): [string, string] => [
        label,
        variant === 'koz-maca' && scoringRule(key) ? '—' : yes(ruleOf(value, key)),
      ]),
    ];
  },
  command: (value) => ({
    variant: variantOf(value),
    options: {
      noTrumpLeadUntilBroken: ruleOf(value, 'noTrumpLeadUntilBroken'),
      defenderBatakPenalty: ruleOf(value, 'defenderBatakPenalty'),
      writeContract: ruleOf(value, 'writeContract'),
    },
  }),
};
