import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { t } from '@rooms/i18n';
export function IconButton({
  label,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      {...props}
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
const avatarSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function Avatar({
  name,
  size = 'normal',
  tone,
}: {
  name: string;
  size?: 'small' | 'normal' | 'large';
  tone?: string;
}) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    words
      .slice(0, 2)
      .map((word) => avatarSegmenter.segment(word)[Symbol.iterator]().next().value?.segment ?? '')
      .join('')
      .toLocaleUpperCase() || '?';
  const tones = ['sand', 'lavender', 'sage', 'blue'];
  const color = tone ?? tones[(name.trim().codePointAt(0) ?? 0) % tones.length];
  return (
    <span
      className={`avatar ${size} ${color}`}
      aria-label={name.trim() || t('Kullanıcı')}
      title={name.trim() || undefined}
    >
      <span aria-hidden="true">{initials}</span>
    </span>
  );
}
export function AvatarStack({ names = [] }: { names?: string[] }) {
  return (
    <span className="avatar-stack">
      {names.map((n) => (
        <Avatar name={n} size="small" key={n} />
      ))}
    </span>
  );
}
const modalStack: { id: symbol; element: HTMLElement }[] = [];
export function Modal({
  title,
  children,
  onClose,
  className = '',
  hideHeading = false,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
  className?: string;
  hideHeading?: boolean;
  /** Action row under the content, right-aligned: put the secondary action before the primary one. */
  footer?: ReactNode;
}) {
  const token = useRef(Symbol());
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const id = token.current;
    modalStack.push({ id, element });
    // Child effects run before parent effects; DOM nesting determines ownership.
    modalStack.sort((a, b) =>
      a.element.contains(b.element) ? -1 : b.element.contains(a.element) ? 1 : 0,
    );
    const previous = document.activeElement as HTMLElement | null;
    const top = () => modalStack.at(-1)?.id === id;
    const focusable = () =>
      Array.from(
        element.querySelectorAll<HTMLElement>(
          'button,input,textarea,select,a[href],[contenteditable="true"],[tabindex]',
        ),
      ).filter(
        (node) =>
          node.tabIndex >= 0 &&
          !node.matches(':disabled,[aria-disabled="true"],input[type="hidden"]') &&
          !node.closest('[hidden],[inert]') &&
          node.closest('[role="dialog"]') === element &&
          getComputedStyle(node).display !== 'none' &&
          getComputedStyle(node).visibility !== 'hidden',
      );
    const focusFirst = () => {
      const elements = focusable();
      (
        elements.find((node) => node.matches('input:not([type="range"]),textarea,select')) ??
        elements[0] ??
        element
      ).focus();
    };
    if (top()) focusFirst();
    const handler = (event: KeyboardEvent) => {
      if (!top()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
      }
      if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements.at(-1);
        if (!first) {
          event.preventDefault();
          element.focus();
        } else if (!elements.includes(document.activeElement as HTMLElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const keepFocus = (event: FocusEvent) => {
      if (top() && !element.contains(event.target as Node)) focusFirst();
    };
    document.addEventListener('keydown', handler, true);
    document.addEventListener('focusin', keepFocus);
    return () => {
      const wasTop = top();
      document.removeEventListener('keydown', handler, true);
      document.removeEventListener('focusin', keepFocus);
      const index = modalStack.findIndex((entry) => entry.id === id);
      if (index >= 0) modalStack.splice(index, 1);
      if (wasTop && previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className={`modal-backdrop ${className.includes('command-modal') ? 'instant-overlay' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && modalStack.at(-1)?.id === token.current)
          close.current();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal glass ${className}`}
      >
        {!hideHeading && (
          <div className="modal-heading">
            <div>
              <h2>{title}</h2>
            </div>
            <IconButton label={t('Pencereyi kapat')} onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
        )}
        {children}
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}
export function EmptyState({
  icon,
  title,
  children,
  action,
  secondaryAction,
  size = 'page',
  className = '',
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  /** Primary action, usually a `button primary`. */
  action?: ReactNode;
  /** Optional second action next to the primary one, usually a `button secondary`. */
  secondaryAction?: ReactNode;
  /** `page` fills a whole surface; `inline` is a compact block inside a panel or list. */
  size?: 'page' | 'inline';
  className?: string;
}) {
  return (
    <div
      className={`empty-state ${size === 'inline' ? 'ds-empty-inline' : ''} ${className}`.trim()}
    >
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      {children != null && children !== false && (
        <div className="empty-description">{children}</div>
      )}
      {secondaryAction ? (
        <div className="ds-empty-actions">
          {action}
          {secondaryAction}
        </div>
      ) : (
        action
      )}
    </div>
  );
}
export type NoticeKind = 'info' | 'success' | 'warning' | 'error';
const noticeIcons = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
} as const;
/**
 * Inline message for a state the person should read: a failure, a caution, a confirmation or a hint.
 * Errors are announced at once (`role="alert"`); the rest wait their turn (`role="status"`).
 */
export function Notice({
  kind = 'info',
  title,
  children,
  action,
  icon,
  role,
  className = '',
}: {
  kind?: NoticeKind;
  title?: string;
  children?: ReactNode;
  /** Optional trailing control, e.g. a retry button. */
  action?: ReactNode;
  /** Replaces the default icon for the kind; pass `null` to hide it. */
  icon?: ReactNode;
  role?: 'status' | 'alert';
  className?: string;
}) {
  const Icon = noticeIcons[kind];
  return (
    <div
      className={`ds-notice ${className}`.trim()}
      data-kind={kind}
      role={role ?? (kind === 'error' ? 'alert' : 'status')}
    >
      {icon !== null && (
        <span className="ds-notice-icon" aria-hidden="true">
          {icon ?? <Icon size={16} />}
        </span>
      )}
      <div className="ds-notice-body">
        {title && <strong className="ds-notice-title">{title}</strong>}
        {children != null && children !== false && <div className="ds-notice-text">{children}</div>}
      </div>
      {action && <div className="ds-notice-action">{action}</div>}
    </div>
  );
}
/** Spinner with an optional visible label. Without a label the busy state is still announced. */
export function LoadingView({
  label,
  size = 'page',
  className = '',
}: {
  label?: string;
  /** `page` centers in the available area; `inline` sits in the flow of a panel. */
  size?: 'page' | 'inline';
  className?: string;
}) {
  return (
    <div
      className={`loading-view ds-loading ${size === 'inline' ? 'ds-loading-inline' : ''} ${className}`.trim()}
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={label ? undefined : t('Yükleniyor…')}
    >
      <span className="loading-ring" aria-hidden="true" />
      {label && <span className="ds-loading-label">{label}</span>}
    </div>
  );
}
export function Toggle({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: boolean;
  onChange(value: boolean): void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      className={`toggle ${value ? 'on' : ''}`}
      role="switch"
      disabled={disabled}
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}
    >
      <span />
    </button>
  );
}
