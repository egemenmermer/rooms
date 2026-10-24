import { t } from '../../i18n';
import type { GameCreateDefinition } from '../registry';
import { MATCH_TARGETS, matchToLabel } from './model';

const matchTo = (value: Record<string, unknown>) =>
  MATCH_TARGETS.find((target) => target === Number(value.matchTo)) ?? 5;

export const tavlaCreate: GameCreateDefinition = {
  defaults: { matchTo: 5, starterRerolls: false },
  title: t('Tavla masası'),
  subtitle: t('Maç uzunluğunu ve açılış kuralını seç.'),
  Options: ({ value, onChange }) => (
    <>
      <div className="rx-create-options tv-three">
        {MATCH_TARGETS.map((target) => (
          <button
            className={matchTo(value) === target ? 'selected' : ''}
            key={target}
            aria-pressed={matchTo(value) === target}
            onClick={() => onChange({ matchTo: target })}
          >
            <strong>{t('{points} puan', { points: target })}</strong>
            <small>{t('Maç {target} biter', { target: matchToLabel(target) })}</small>
          </button>
        ))}
      </div>
      <div className="rx-create-options two">
        {([false, true] as const).map((option) => (
          <button
            className={(value.starterRerolls === true) === option ? 'selected' : ''}
            key={String(option)}
            aria-pressed={(value.starterRerolls === true) === option}
            onClick={() => onChange({ starterRerolls: option })}
          >
            <strong>{option ? t('Başlayan yeniden atar') : t('Açılış zarlarıyla oyna')}</strong>
            <small>
              {option
                ? t('Büyük atan iki zarı yeniden atar')
                : t('Büyük atan iki açılış zarını oynar')}
            </small>
          </button>
        ))}
      </div>
    </>
  ),
  summary: (value) => [
    [t('Oyuncu'), '2'],
    [t('Maç'), t('{points} puan', { points: matchTo(value) })],
    [
      t('Açılış'),
      value.starterRerolls === true ? t('Başlayan yeniden atar') : t('Açılış zarlarıyla'),
    ],
  ],
  rules: (value) => [
    [t('Oyuncu'), t('2 · 15’er pul')],
    [
      t('Açılış'),
      value.starterRerolls === true
        ? t('Büyük atan iki zarı yeniden atar')
        : t('Büyük atan iki açılış zarını oynar'),
    ],
    [t('Çift zar'), t('Dört hamle')],
    [t('Zorunlu hamle'), t('İki zar oynanabiliyorsa ikisi de; biri oynanabiliyorsa büyüğü')],
    [t('Kırılan pul'), t('Önce bardan girer')],
    [t('Puan'), t('Normal 1 · Mars 2')],
    [t('Maç'), t('{points} puan', { points: matchTo(value) })],
  ],
  command: (value) => ({
    options: { matchTo: matchTo(value), starterRerolls: value.starterRerolls === true },
  }),
};
