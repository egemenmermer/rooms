import { t } from '../../i18n';
import type { GameCreateDefinition } from '../registry';

export const okey101Create: GameCreateDefinition = {
  defaults: { folding: false, teams: false },
  title: t('101 Okey masası'),
  subtitle: t('Masa kurallarını seç.'),
  Options: ({ value, onChange }) => (
    <>
      <div className="rx-create-options two">
        {([false, true] as const).map((option) => (
          <button
            className={value.folding === option ? 'selected' : ''}
            key={String(option)}
            onClick={() => onChange({ folding: option })}
          >
            <strong>{option ? t('Katlamalı') : t('Katlamasız')}</strong>
            <small>{option ? t('Önceki açılış toplamını geç') : t('Açılış en az 101')}</small>
          </button>
        ))}
      </div>
      <div className="rx-create-options two">
        {([false, true] as const).map((option) => (
          <button
            className={value.teams === option ? 'selected' : ''}
            key={String(option)}
            onClick={() => onChange({ teams: option })}
          >
            <strong>{option ? t('Eşli') : t('Tekli')}</strong>
            <small>{option ? t('2 + 2 oyuncu') : t('4 oyuncu')}</small>
          </button>
        ))}
      </div>
    </>
  ),
  summary: (value) => [
    [t('Oyuncu'), '4'],
    [t('Açılış'), t('101 · 5 çift')],
    [t('Katlamalı'), value.folding ? t('Açık') : t('Kapalı')],
    [t('Eşli'), value.teams ? t('Açık') : t('Kapalı')],
  ],
  rules: (value) => [
    [t('Oyuncu'), t('4 · Eşler karşılıklı')],
    [t('Dağıtım'), t('Başlayan 22, diğerleri 21 taş')],
    [t('Açılış'), value.folding ? t('Son açıştan en az 1 fazla · İlk 101') : t('En az 101')],
    [t('Çift'), t('En az 5 çift')],
    [t('Açma türü'), t('Seri ve çift aynı oyuncuda karıştırılmaz')],
    ['Okey', t('Göstergenin bir üstü')],
    [t('Bitirme'), t('Son taş atılır')],
    [t('Puan'), t('Kazanan −101 · Açmayan 202 · Okey bitişi iki kat')],
  ],
  command: (value) => ({ folding: value.folding === true, teams: value.teams === true }),
};
