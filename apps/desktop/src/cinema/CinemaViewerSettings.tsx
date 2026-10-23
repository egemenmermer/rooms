import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  setCinemaPreferences,
  useCinemaPreferences,
  type CinemaPreferences,
} from './cinema-preferences';
import {
  bindHallKey,
  chordOf,
  hallCommands,
  keyLabel,
  resetHallKeys,
  useHallKeys,
  type HallCommand,
} from './hall-keys';
import { t } from '../i18n';

const subtitleChoices: {
  value: CinemaPreferences['subtitleLanguage'];
  label: string;
  detail: string;
}[] = [
  {
    value: 'auto',
    label: t('Türkçe'),
    detail: t(
      'Film başka bir dildeyse Türkçe altyazı açılır; Türkçe seste yalnızca zorunlu altyazı.',
    ),
  },
  {
    value: 'eng',
    label: t('İngilizce'),
    detail: t('Film başka bir dildeyse İngilizce altyazı açılır.'),
  },
  { value: 'off', label: t('Kapalı'), detail: t('Altyazıyı yalnızca menüden sen açarsın.') },
];

/** This viewer's own cinema choices; nothing here changes what the hall sees. */
export function CinemaViewerSettings() {
  const preferences = useCinemaPreferences();
  return (
    <section className="cs-section">
      <h2>{t('Benim tercihlerim')}</h2>
      <p>{t('Bunlar yalnızca senin ekranını değiştirir; salondaki diğer kişiler etkilenmez.')}</p>
      <div className="cs-choices" role="radiogroup" aria-label={t('Varsayılan altyazı dili')}>
        <strong className="cs-choices-title">{t('Varsayılan altyazı')}</strong>
        {subtitleChoices.map((choice) => (
          <label key={choice.value} className="cs-choice">
            <input
              type="radio"
              name="cinema-subtitle-language"
              checked={preferences.subtitleLanguage === choice.value}
              onChange={() => setCinemaPreferences({ subtitleLanguage: choice.value })}
            />
            <span>
              <strong>{choice.label}</strong>
              <small>{choice.detail}</small>
            </span>
          </label>
        ))}
      </div>
      <label className="cs-choice cs-check">
        <input
          type="checkbox"
          checked={preferences.blurUnwatched}
          onChange={(event) => setCinemaPreferences({ blurUnwatched: event.target.checked })}
        />
        <span>
          <strong>{t('İzlenmemiş bölümleri bulanıklaştır')}</strong>
          <small>
            {t('Dizi sayfasında salonun henüz bitirmediği bölümlerin görseli ve özeti gizlenir.')}
          </small>
        </span>
      </label>
    </section>
  );
}

/** Settings → Klavye: the cinema hall's keys, changed one by one. */
export function HallKeySettings() {
  const keys = useHallKeys();
  const [listening, setListening] = useState<HallCommand | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!listening) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') return setListening(null);
      if (event.metaKey || event.ctrlKey || event.altKey) {
        setNote(
          t('Sinema kısayolları ⌘, Ctrl ya da Alt ile birlikte kullanılmaz; Shift olabilir.'),
        );
        return;
      }
      if (['Shift', 'Meta', 'Control', 'Alt', 'CapsLock'].includes(event.key)) return;
      const command = listening;
      const result = bindHallKey(command, chordOf(event));
      setListening(null);
      const name = (id: HallCommand) => hallCommands.find((c) => c.id === id)!.label;
      setNote(
        result === 'reserved'
          ? t('Bu tuş ayrılmış (Esc, Tab, Enter ve rakamlar değiştirilemez).')
          : result
            ? t('{key} artık “{command}”. “{other}” kısayolsuz kaldı.', {
                key: keyLabel(chordOf(event)),
                command: name(command),
                other: name(result),
              })
            : '',
      );
    };
    window.addEventListener('keydown', capture, true);
    return () => window.removeEventListener('keydown', capture, true);
  }, [listening]);
  return (
    <section className="hall-key-settings">
      <h3>{t('Sinema salonu')}</h3>
      <p>{t('Bir kısayolu değiştirmek için tıkla ve yeni tuşa bas. Esc vazgeçer.')}</p>
      {hallCommands.map(({ id, label }) => (
        <div className="shortcut-row" key={id}>
          <span>{label}</span>
          <span className="hall-key-edit">
            <button
              className={`hall-key-button ${listening === id ? 'listening' : ''}`}
              aria-label={t('{label}: {key}. Değiştir', { label, key: keyLabel(keys[id]) })}
              onClick={() => {
                setNote('');
                setListening(listening === id ? null : id);
              }}
            >
              {listening === id ? t('Bir tuşa bas…') : <kbd>{keyLabel(keys[id])}</kbd>}
            </button>
            <button
              className="hall-key-reset"
              aria-label={t('{label}: varsayılana döndür', { label })}
              title={t('Varsayılana döndür')}
              onClick={() => resetHallKeys(id)}
            >
              <RotateCcw size={13} />
            </button>
          </span>
        </div>
      ))}
      {note && (
        <p className="hall-key-note" role="status">
          {note}
        </p>
      )}
      <button
        className="button secondary small"
        onClick={() => {
          resetHallKeys();
          setNote(t('Sinema kısayolları varsayılana döndü.'));
        }}
      >
        <RotateCcw size={14} />
        {t('Hepsini varsayılana döndür')}
      </button>
    </section>
  );
}
