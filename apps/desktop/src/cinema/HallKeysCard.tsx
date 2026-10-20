import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { hallCommands, keyLabel, useHallKeys } from './hall-keys';
import { paletteShortcut } from './hall-model';

/** The hall's keys at a glance (`?`); they are changed in Settings → Klavye. */
export function HallKeysCard({ onClose }: { onClose(): void }) {
  const keys = useHallKeys();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  return (
    <div
      className="hall-keys-backdrop"
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="hall-keys-card"
        role="dialog"
        aria-modal="true"
        aria-label="Sinema kısayolları"
      >
        <header>
          <h2>Kısayollar</h2>
          <button ref={close} className="hall-icon-button" aria-label="Kapat" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <dl>
          {hallCommands.map(({ id, label }) => (
            <div key={id}>
              <dt>{label}</dt>
              <dd>
                <kbd>{keyLabel(keys[id])}</kbd>
              </dd>
            </div>
          ))}
          <div>
            <dt>Kanal numarası</dt>
            <dd>
              <kbd>0–9</kbd>
            </dd>
          </div>
          <div>
            <dt>Bir şey aç</dt>
            <dd>
              <kbd>{paletteShortcut}</kbd>
            </dd>
          </div>
          <div>
            <dt>Geri dön / kapat</dt>
            <dd>
              <kbd>Esc</kbd>
            </dd>
          </div>
        </dl>
        <p>Tuşları Ayarlar → Klavye'den değiştirebilirsin.</p>
      </section>
    </div>
  );
}
