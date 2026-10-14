import { useEffect, useRef, type ReactNode } from 'react';
/** Native disclosure semantics, Escape/outside dismissal and restored focus. */
export function QuietMenu({
  label,
  children,
  compact = false,
  arrow = false,
}: {
  label: string;
  children: ReactNode;
  compact?: boolean;
  arrow?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.open) {
        e.stopPropagation();
        ref.current.open = false;
        ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return (
    <details ref={ref} className={`quiet-menu ${compact ? 'compact' : ''}`}>
      <summary aria-label={label}>
        {arrow ? '⌄' : compact ? '•••' : label}
        <span aria-hidden="true">⌄</span>
      </summary>
      <div
        className="quiet-menu-content"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button') && ref.current) ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}
