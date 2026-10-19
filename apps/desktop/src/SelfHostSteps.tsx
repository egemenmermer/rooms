import { useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, ExternalLink } from 'lucide-react';
import { SELF_HOST_GUIDE_URL, SELF_HOST_STEPS } from './self-host-content';

/** Five short steps from renting a server to the first invitation; links open in the browser. */
export function SelfHostSteps({ onSignIn }: { onSignIn(): void }) {
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState('');
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(''), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = (value: string) => {
    setCopyError('');
    void navigator.clipboard
      .writeText(value)
      .then(() => setCopied(value))
      .catch(() => setCopyError('Kopyalanamadı. Komutu seçip elle kopyala.'));
  };
  return (
    <section className="ref-auth-form ref-selfhost" aria-labelledby="reference-selfhost-title">
      <h2 id="reference-selfhost-title">Kendi sunucunu kur</h2>
      <p>Kiralık bir sunucuda yaklaşık 15 dakika sürer. Sunucu ve veriler senin olur.</p>
      <ol className="ref-start-steps">
        {SELF_HOST_STEPS.map((step, index) => (
          <li key={step.title}>
            <span className="ref-start-step-number" aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              {step.commands?.map((command) => (
                <div className="ref-start-command" key={command.value}>
                  <code aria-label={command.label}>{command.value}</code>
                  <button
                    type="button"
                    aria-label={`${command.label}: kopyala`}
                    onClick={() => copy(command.value)}
                  >
                    {copied === command.value ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              ))}
              {!!step.links?.length && (
                <div className="ref-start-links">
                  {step.links.map((link) => (
                    <a
                      key={link.url}
                      className="button secondary"
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${link.label}: siteye git`}
                    >
                      {link.label}
                      <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  ))}
                </div>
              )}
              {step.signIn && (
                <button type="button" className="button secondary" onClick={onSignIn}>
                  Giriş yap sekmesine geç
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {copyError && (
        <div className="ref-auth-notice error" role="alert">
          {copyError}
        </div>
      )}
      {copied && (
        <p className="ref-start-live" role="status">
          Kopyalandı.
        </p>
      )}
      <p className="ref-auth-footer">
        <a href={SELF_HOST_GUIDE_URL} target="_blank" rel="noopener noreferrer">
          Ayrıntılı kurulum rehberi
        </a>
        <br />
        Aynı ağdaki arkadaşlarla alan adı olmadan çalışan yerel mod hazırlanıyor.
      </p>
    </section>
  );
}
