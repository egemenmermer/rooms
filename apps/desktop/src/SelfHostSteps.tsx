import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink } from 'lucide-react';
import { t } from './i18n';
import { SELF_HOST_GUIDE_URL, SELF_HOST_STEPS } from './self-host-content';

/**
 * Renting a server to the first invitation, one step per screen so the tab never scrolls.
 * The primary button stays the same element across steps, so keyboard focus is not lost.
 */
export function SelfHostSteps({ onSignIn }: { onSignIn(): void }) {
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState('');
  const next = useRef<HTMLButtonElement>(null);
  const step = SELF_HOST_STEPS[index]!;
  const total = SELF_HOST_STEPS.length;
  const last = index === total - 1;
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(''), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const go = (target: number) => {
    setCopyError('');
    setIndex(Math.max(0, Math.min(total - 1, target)));
  };
  const copy = (value: string) => {
    setCopyError('');
    void navigator.clipboard
      .writeText(value)
      .then(() => setCopied(value))
      .catch(() => setCopyError(t('Kopyalanamadı. Komutu seçip elle kopyala.')));
  };
  return (
    <section className="ref-auth-form ref-selfhost" aria-labelledby="reference-selfhost-title">
      <h2 id="reference-selfhost-title">{t('Kendi sunucunu kur')}</h2>
      <p>{t('Yaklaşık 15 dakika sürer; sunucu ve veriler senin olur.')}</p>
      <div className="ref-start-progress">
        {SELF_HOST_STEPS.map((item, position) => (
          <button
            key={item.title}
            type="button"
            className={position <= index ? 'done' : ''}
            aria-label={t('{step}. adım: {title}', { step: position + 1, title: item.title })}
            aria-current={position === index ? 'step' : undefined}
            onClick={() => go(position)}
          />
        ))}
      </div>
      <div className="ref-start-step">
        <small>{t('Adım {step} / {total}', { step: index + 1, total })}</small>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        {!!step.chips?.length && (
          <ul className="ref-start-chips">
            {step.chips.map((chip) => (
              <li key={chip}>{chip}</li>
            ))}
          </ul>
        )}
        {step.commands?.map((command) => (
          <div className="ref-start-command" key={command.value}>
            <code aria-label={command.label}>{command.value}</code>
            <button
              type="button"
              aria-label={t('{label}: kopyala', { label: command.label })}
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
                aria-label={t('{label}: siteye git', { label: link.label })}
              >
                {link.label}
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="ref-start-nav">
        <button
          type="button"
          className="button secondary"
          disabled={index === 0}
          onClick={() => {
            // Leaving the first step disables "Geri"; hand focus to the button that stays.
            if (index === 1) next.current?.focus();
            go(index - 1);
          }}
        >
          <ArrowLeft size={15} />
          {t('Geri')}
        </button>
        <button
          ref={next}
          type="button"
          className="button primary"
          onClick={() => (last ? onSignIn() : go(index + 1))}
        >
          {last ? t('Giriş yap sekmesine geç') : t('İleri')}
          <ArrowRight size={15} />
        </button>
      </div>
      {copyError && (
        <div className="ref-auth-notice error" role="alert">
          {copyError}
        </div>
      )}
      <p className="ref-start-live" role="status">
        {copied
          ? t('Adım {step} / {total}: {title} · Kopyalandı.', {
              step: index + 1,
              total,
              title: step.title,
            })
          : t('Adım {step} / {total}: {title}', { step: index + 1, total, title: step.title })}
      </p>
      <p className="ref-auth-footer">
        <a href={SELF_HOST_GUIDE_URL} target="_blank" rel="noopener noreferrer">
          {t('Ayrıntılı kurulum rehberi')}
        </a>
        {' · '}
        {t('Alan adı gerektirmeyen yerel mod hazırlanıyor.')}
      </p>
    </section>
  );
}
