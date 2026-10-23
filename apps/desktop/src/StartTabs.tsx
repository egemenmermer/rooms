import { useRef } from 'react';
import { t } from './i18n';

export type StartTab = 'register' | 'signin' | 'selfhost';
export const START_TABS: { id: StartTab; label: string }[] = [
  { id: 'register', label: t('Kayıt ol') },
  { id: 'signin', label: t('Giriş yap') },
  { id: 'selfhost', label: t('Kendi sunucunu kur') },
];
export const START_PANEL_ID = 'ref-start-panel';
export const startTabId = (tab: StartTab) => `ref-start-tab-${tab}`;

/** Signed-out start screen tabs; follows the WAI-ARIA tabs pattern with automatic activation. */
export function StartTabs({
  active,
  onSelect,
}: {
  active: StartTab;
  onSelect(tab: StartTab): void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (index: number) => {
    const next = (index + START_TABS.length) % START_TABS.length;
    buttons.current[next]?.focus();
    onSelect(START_TABS[next]!.id);
  };
  return (
    <div className="ref-start-tabs" role="tablist" aria-label={t('Başlangıç')}>
      {START_TABS.map((tab, index) => (
        <button
          key={tab.id}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          id={startTabId(tab.id)}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          aria-controls={START_PANEL_ID}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(e) => {
            const target =
              e.key === 'ArrowRight'
                ? index + 1
                : e.key === 'ArrowLeft'
                  ? index - 1
                  : e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? START_TABS.length - 1
                      : null;
            if (target === null) return;
            e.preventDefault();
            move(target);
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
