import { t } from '../../i18n';
import { useEffect, useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { Avatar, Modal } from '@rooms/design';
import { useGameFixtureMetadata } from './fixture';
import type { GameCreateDefinition, GameSetupValues } from '../registry';
import { names } from './model';

/** The setup page before `game.create`; the game's registry entry supplies the choices and rows. */
export function ReferenceCreateGame({
  kind,
  definition,
  setup,
  onSetup,
  participants,
  busy,
  disabled,
  reason,
  error,
  consent,
  onCancel,
  onSubmit,
}: {
  kind: string;
  definition: GameCreateDefinition;
  /** The route's choices; the definition's defaults fill what is missing. */
  setup: GameSetupValues;
  onSetup(patch: GameSetupValues): void;
  participants: { userId: string; displayName?: string }[];
  busy: boolean;
  disabled: boolean;
  reason: string;
  error: string;
  /** Explicit "end the open activity and set up this table" choice. */
  consent?: { label: string; checked: boolean; onChange(checked: boolean): void };
  onCancel(): void;
  onSubmit(): void;
}) {
  const fixtureMetadata = useGameFixtureMetadata();
  const [rulesOpen, setRulesOpen] = useState(false);
  useEffect(() => {
    if (fixtureMetadata) setRulesOpen(fixtureMetadata.ui.modal === 'rules');
  }, [fixtureMetadata]);
  const value = { ...definition.defaults, ...setup };
  const Options = definition.Options;
  return (
    <div className="rg-page rx-create">
      <header className="rg-heading">
        <div>
          <h1>{definition.title}</h1>
          <p>{definition.subtitle}</p>
        </div>
        <div>
          <button onClick={() => setRulesOpen(true)}>
            <ShieldCheck size={16} />
            {t('Masa kuralları')}
          </button>
          <button onClick={onCancel}>
            <X size={16} />
            {t('Vazgeç')}
          </button>
        </div>
      </header>
      <Options value={value} onChange={onSetup} />
      <div className="rx-create-body">
        <section>
          <h3>{t('Odadaki kişiler')}</h3>
          {participants.length ? (
            participants.map((person) => {
              // A cached or partial room snapshot can lack the name; never render a blank row.
              const name = person.displayName?.trim() || t('Kullanıcı');
              return (
                <div className="rx-create-participant" key={person.userId}>
                  <Avatar name={name} />
                  <strong>{name}</strong>
                </div>
              );
            })
          ) : (
            <p>{t('Katılımcı bilgisi henüz alınmadı.')}</p>
          )}
          <p className="rg-footer-note">{t('Masa kurulduktan sonra oyuncular koltuk seçer.')}</p>
        </section>
        <aside className="rg-rules">
          <h3>{t('Masa özeti')}</h3>
          <div>
            <span>{t('Oyun')}</span>
            <strong>{names[kind]}</strong>
          </div>
          {definition.summary(value).map(([label, text]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{text}</strong>
            </div>
          ))}
          <div>
            <span>{t('Puan')}</span>
            <strong>{t('Yalnızca sanal')}</strong>
          </div>
        </aside>
      </div>
      {reason && (
        <div className="rg-banner" role="status">
          {reason}
        </div>
      )}
      {consent && (
        <label className="rg-replace-consent">
          <input
            type="checkbox"
            checked={consent.checked}
            disabled={busy}
            onChange={(event) => consent.onChange(event.target.checked)}
          />
          <span>{consent.label}</span>
        </label>
      )}
      {error && (
        <div className="rg-banner error" role="alert">
          {error}
        </div>
      )}
      <footer>
        <button className="button secondary" onClick={onCancel}>
          {t('Vazgeç')}
        </button>
        <button
          className="button primary"
          disabled={busy || disabled}
          title={reason || undefined}
          onClick={onSubmit}
        >
          {t('Masayı kur')}
        </button>
      </footer>
      {rulesOpen && (
        <Modal title={t('Masa kuralları')} className="rg-modal" onClose={() => setRulesOpen(false)}>
          <div className="rg-modal-body rg-rules">
            {definition.rules(value).map(([label, text]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{text}</strong>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
