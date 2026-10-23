import { useState } from 'react';
import { changeLocale, localePreference, t, uiError, type LocalePreference } from './i18n';

/** Settings → Appearance row; native language names stay untranslated so either reader finds them. */
export function LanguageSetting() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="settings-row">
      <div>
        <h4>{t('Dil / Language')}</h4>
        <p>
          {t(
            'Uygulamanın dili. Değiştirince pencere yeniden yüklenir; ses bağlantın bir an kopar.',
          )}
        </p>
        {error && <p role="alert">{error}</p>}
      </div>
      <select
        aria-label={t('Dil / Language')}
        value={localePreference}
        disabled={busy}
        onChange={async (event) => {
          setBusy(true);
          setError('');
          try {
            await changeLocale(event.target.value as LocalePreference);
          } catch (cause) {
            setError(uiError(cause) || t('Dil değiştirilemedi. Yeniden dene.'));
            setBusy(false);
          }
        }}
      >
        <option value="system">{t('Sistem dili')}</option>
        {/* i18n-ignore: each language keeps its own name */}
        <option value="tr">Türkçe</option>
        <option value="en">English</option>
      </select>
    </div>
  );
}
