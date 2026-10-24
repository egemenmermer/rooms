import { t } from '../../i18n';
import type { GameCreateDefinition, GameSetupValues } from '../registry';

export type BatakVariant = 'ihaleli' | 'esli' | 'koz-maca' | 'gommeli';
const variantOf = (value: GameSetupValues) => String(value.variant) as BatakVariant;
const modes = () =>
  [
    ['ihaleli', t('İhaleli'), '♣', t('4 oyuncu · Tekli')],
    ['esli', t('Eşli'), '♠', t('4 oyuncu · 2 + 2')],
    ['koz-maca', t('Koz Maça'), '♠', t('4 oyuncu · Sabit koz')],
    ['gommeli', t('Gömmeli'), '♦', t('3 oyuncu · 4 kart gömme')],
  ] as const;
const count = (value: GameSetupValues) => (variantOf(value) === 'gommeli' ? 3 : 4);

export const batakCreate: GameCreateDefinition = {
  defaults: { variant: 'ihaleli' },
  title: t('Hangi Batak?'),
  subtitle: t('Batak türünü seç.'),
  Options: ({ value, onChange }) => (
    <div className="rx-create-options">
      {modes().map(([id, label, symbol, detail]) => (
        <button
          key={id}
          className={variantOf(value) === id ? 'selected' : ''}
          onClick={() => onChange({ variant: id })}
        >
          <span>{symbol}</span>
          <strong>{label}</strong>
          <small>{detail}</small>
        </button>
      ))}
    </div>
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
      [t('Puan'), t('Sunucunun mevcut Batak puan profili')],
    ];
  },
  command: (value) => ({ variant: variantOf(value) }),
};
