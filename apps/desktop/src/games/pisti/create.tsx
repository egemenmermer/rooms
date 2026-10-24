import { t } from '../../i18n';
import type { GameCreateDefinition, GameSetupValues } from '../registry';
import { PISTI_TARGETS } from './model';

const targetOf = (value: GameSetupValues) =>
  PISTI_TARGETS.find((target) => target === Number(value.target)) ?? 151;
const reshuffleOf = (value: GameSetupValues) => value.reshuffleJackTop !== false;
const targetDetail = (target: number) =>
  target === 101 ? t('Kısa maç') : target === 151 ? t('Klasik maç') : t('Uzun maç');

/** Pişti table setup: match target and whether an opening jack goes back into the deck. */
export const pistiCreate: GameCreateDefinition = {
  defaults: { target: 151, reshuffleJackTop: true },
  title: t('Pişti masası'),
  subtitle: t('Maç kaç puana oynansın?'),
  Options: ({ value, onChange }) => (
    <>
      <div className="rx-create-options" role="group" aria-label={t('Maç hedefi')}>
        {PISTI_TARGETS.map((target) => (
          <button
            key={target}
            className={targetOf(value) === target ? 'selected' : ''}
            aria-pressed={targetOf(value) === target}
            onClick={() => onChange({ target })}
          >
            <span>{target}</span>
            <strong>{t('{target} puan', { target })}</strong>
            <small>{targetDetail(target)}</small>
          </button>
        ))}
      </div>
      <div className="rx-create-options two" role="group" aria-label={t('Yerdeki vale')}>
        {([true, false] as const).map((option) => (
          <button
            key={String(option)}
            className={reshuffleOf(value) === option ? 'selected' : ''}
            aria-pressed={reshuffleOf(value) === option}
            onClick={() => onChange({ reshuffleJackTop: option })}
          >
            <strong>{option ? t('Vale desteye döner') : t('Vale yerde kalır')}</strong>
            <small>
              {option
                ? t('Açılışta üstteki kart vale çıkarsa desteye karışır')
                : t('Açılıştaki vale ilk alana gider')}
            </small>
          </button>
        ))}
      </div>
    </>
  ),
  summary: (value) => [
    [t('Oyuncu'), t('2 ya da 4 · Dörtte eşler karşılıklı')],
    [t('Maç'), t('{target} puan', { target: targetOf(value) })],
    [t('Yerdeki vale'), reshuffleOf(value) ? t('Desteye döner') : t('Yerde kalır')],
  ],
  rules: (value) => [
    [t('Oyuncu'), t('2 ya da 4 · Dörtte eşler karşılıklı')],
    [t('Dağıtım'), t('Yere 4 kart (üstteki açık), herkese 4 kart')],
    [t('Alma'), t('Aynı değerdeki kart ya da vale yerdeki bütün kartları alır')],
    [t('Pişti'), t('Yerde tek kart varken aynısıyla almak 10 · Valeyle vale 20')],
    [t('Kart puanı'), t('As 1 · Vale 1 · ♣2 2 · ♦10 3')],
    [t('En çok kart'), t('3 puan · Eşitlikte kimse almaz')],
    [t('Son kartlar'), t('Yerde kalanları son alan alır')],
    [t('Maç'), t('{target} puan', { target: targetOf(value) })],
    [t('Yerdeki vale'), reshuffleOf(value) ? t('Desteye döner') : t('Yerde kalır')],
  ],
  command: (value) => ({
    options: { target: targetOf(value), reshuffleJackTop: reshuffleOf(value) },
  }),
};
