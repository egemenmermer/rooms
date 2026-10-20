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

const subtitleChoices: {
  value: CinemaPreferences['subtitleLanguage'];
  label: string;
  detail: string;
}[] = [
  {
    value: 'auto',
    label: 'Türkçe',
    detail: 'Film başka bir dildeyse Türkçe altyazı açılır; Türkçe seste yalnızca zorunlu altyazı.',
  },
  {
    value: 'eng',
    label: 'İngilizce',
    detail: 'Film başka bir dildeyse İngilizce altyazı açılır.',
  },
  { value: 'off', label: 'Kapalı', detail: 'Altyazıyı yalnızca menüden sen açarsın.' },
];

/** This viewer's own cinema choices; nothing here changes what the hall sees. */
export function CinemaViewerSettings() {
  const preferences = useCinemaPreferences();
  return (
    <section className="cs-section">
      <h2>Benim tercihlerim</h2>
      <p>Bunlar yalnızca senin ekranını değiştirir; salondaki diğer kişiler etkilenmez.</p>
      <div className="cs-choices" role="radiogroup" aria-label="Varsayılan altyazı dili">
        <strong className="cs-choices-title">Varsayılan altyazı</strong>
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
          <strong>İzlenmemiş bölümleri bulanıklaştır</strong>
          <small>
            Dizi sayfasında salonun henüz bitirmediği bölümlerin görseli ve özeti gizlenir.
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
        setNote('Sinema kısayolları ⌘, Ctrl ya da Alt ile birlikte kullanılmaz; Shift olabilir.');
        return;
      }
      if (['Shift', 'Meta', 'Control', 'Alt', 'CapsLock'].includes(event.key)) return;
      const command = listening;
      const result = bindHallKey(command, chordOf(event));
      setListening(null);
      const name = (id: HallCommand) => hallCommands.find((c) => c.id === id)!.label;
      setNote(
        result === 'reserved'
          ? 'Bu tuş ayrılmış (Esc, Tab, Enter ve rakamlar değiştirilemez).'
          : result
            ? `${keyLabel(chordOf(event))} artık “${name(command)}”. “${name(result)}” kısayolsuz kaldı.`
            : '',
      );
    };
    window.addEventListener('keydown', capture, true);
    return () => window.removeEventListener('keydown', capture, true);
  }, [listening]);
  return (
    <section className="hall-key-settings">
      <h3>Sinema salonu</h3>
      <p>Bir kısayolu değiştirmek için tıkla ve yeni tuşa bas. Esc vazgeçer.</p>
      {hallCommands.map(({ id, label }) => (
        <div className="shortcut-row" key={id}>
          <span>{label}</span>
          <span className="hall-key-edit">
            <button
              className={`hall-key-button ${listening === id ? 'listening' : ''}`}
              aria-label={`${label}: ${keyLabel(keys[id])}. Değiştir`}
              onClick={() => {
                setNote('');
                setListening(listening === id ? null : id);
              }}
            >
              {listening === id ? 'Bir tuşa bas…' : <kbd>{keyLabel(keys[id])}</kbd>}
            </button>
            <button
              className="hall-key-reset"
              aria-label={`${label}: varsayılana döndür`}
              title="Varsayılana döndür"
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
          setNote('Sinema kısayolları varsayılana döndü.');
        }}
      >
        <RotateCcw size={14} />
        Hepsini varsayılana döndür
      </button>
    </section>
  );
}
