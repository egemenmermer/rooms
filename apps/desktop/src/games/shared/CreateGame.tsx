import { t } from '../../i18n';
import { useEffect, useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { Avatar, Modal } from '@rooms/design';
import { useGameFixtureMetadata } from './fixture';
import { names } from './model';

export function ReferenceCreateGame({
  kind,
  variant,
  setVariant,
  folding,
  setFolding,
  teams,
  setTeams,
  participants,
  busy,
  disabled,
  reason,
  error,
  consent,
  onCancel,
  onSubmit,
}: {
  kind: 'batak' | '101';
  variant: 'ihaleli' | 'esli' | 'koz-maca' | 'gommeli';
  setVariant(value: 'ihaleli' | 'esli' | 'koz-maca' | 'gommeli'): void;
  folding: boolean;
  setFolding(value: boolean): void;
  teams: boolean;
  setTeams(value: boolean): void;
  participants: { userId: string; displayName: string }[];
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
  const count = kind === 'batak' && variant === 'gommeli' ? 3 : 4;
  const modes = [
    ['ihaleli', t('İhaleli'), '♣', t('4 oyuncu · Tekli')],
    ['esli', t('Eşli'), '♠', t('4 oyuncu · 2 + 2')],
    ['koz-maca', t('Koz Maça'), '♠', t('4 oyuncu · Sabit koz')],
    ['gommeli', t('Gömmeli'), '♦', t('3 oyuncu · 4 kart gömme')],
  ] as const;
  return (
    <div className="rg-page rx-create">
      <header className="rg-heading">
        <div>
          <h1>{kind === 'batak' ? t('Hangi Batak?') : t('101 Okey masası')}</h1>
          <p>{kind === 'batak' ? t('Batak türünü seç.') : t('Masa kurallarını seç.')}</p>
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
      {kind === 'batak' ? (
        <div className="rx-create-options">
          {modes.map(([id, label, symbol, detail]) => (
            <button
              key={id}
              className={variant === id ? 'selected' : ''}
              onClick={() => setVariant(id)}
            >
              <span>{symbol}</span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="rx-create-options two">
            {([false, true] as const).map((value) => (
              <button
                className={folding === value ? 'selected' : ''}
                key={String(value)}
                onClick={() => setFolding(value)}
              >
                <strong>{value ? t('Katlamalı') : t('Katlamasız')}</strong>
                <small>{value ? t('Önceki açılış toplamını geç') : t('Açılış en az 101')}</small>
              </button>
            ))}
          </div>
          <div className="rx-create-options two">
            {([false, true] as const).map((value) => (
              <button
                className={teams === value ? 'selected' : ''}
                key={String(value)}
                onClick={() => setTeams(value)}
              >
                <strong>{value ? t('Eşli') : t('Tekli')}</strong>
                <small>{value ? t('2 + 2 oyuncu') : t('4 oyuncu')}</small>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="rx-create-body">
        <section>
          <h3>{t('Odadaki kişiler')}</h3>
          {participants.length ? (
            participants.map((person) => (
              <div className="rx-create-participant" key={person.userId}>
                <Avatar name={person.displayName} />
                <strong>{person.displayName}</strong>
              </div>
            ))
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
          <div>
            <span>{t('Oyuncu')}</span>
            <strong>{count}</strong>
          </div>
          {kind === 'batak' ? (
            <>
              <div>
                <span>{t('Tür')}</span>
                <strong>{modes.find((mode) => mode[0] === variant)?.[1]}</strong>
              </div>
              <div>
                <span>{t('Akış')}</span>
                <strong>
                  {variant === 'gommeli'
                    ? t('İhale · Koz · Gömme · Oyun')
                    : variant === 'koz-maca'
                      ? t('Tahmin · Oyun')
                      : t('İhale · Koz · Oyun')}
                </strong>
              </div>
            </>
          ) : (
            <>
              <div>
                <span>{t('Açılış')}</span>
                <strong>{t('101 · 5 çift')}</strong>
              </div>
              <div>
                <span>{t('Katlamalı')}</span>
                <strong>{folding ? t('Açık') : t('Kapalı')}</strong>
              </div>
              <div>
                <span>{t('Eşli')}</span>
                <strong>{teams ? t('Açık') : t('Kapalı')}</strong>
              </div>
            </>
          )}
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
            {(kind === 'batak'
              ? [
                  [t('Oyuncu'), String(count)],
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
                ]
              : [
                  [t('Oyuncu'), t('4 · Eşler karşılıklı')],
                  [t('Dağıtım'), t('Başlayan 22, diğerleri 21 taş')],
                  [
                    t('Açılış'),
                    folding ? t('Son açıştan en az 1 fazla · İlk 101') : t('En az 101'),
                  ],
                  [t('Çift'), t('En az 5 çift')],
                  [t('Açma türü'), t('Seri ve çift aynı oyuncuda karıştırılmaz')],
                  ['Okey', t('Göstergenin bir üstü')],
                  [t('Bitirme'), t('Son taş atılır')],
                  [t('Puan'), t('Kazanan −101 · Açmayan 202 · Okey bitişi iki kat')],
                ]
            ).map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
