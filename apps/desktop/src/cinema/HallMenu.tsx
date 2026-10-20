import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type HallMenuItem = {
  label: string;
  icon?: ReactNode;
  /** A destructive entry: red text on a faint red ground, first in the list. */
  danger?: boolean;
  disabled?: boolean;
  onSelect(): void;
};

type Open = { x: number; y: number; label: string; items: HallMenuItem[] };

/** Press and hold this long (ms) to open a card's menu, like a right click. */
const HOLD_MS = 500;
const EDGE = 8;

/**
 * A context menu for cards and the screen: right click or press and hold opens it at the
 * pointer; Escape, a click outside, scrolling or a pick closes it.
 */
export function useHallMenu() {
  const [open, setOpen] = useState<Open | null>(null);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  /** Set when a hold opened the menu, so the click that ends the press does nothing. */
  const held = useRef(false);
  const close = useCallback(() => setOpen(null), []);
  const show = useCallback(
    (x: number, y: number, label: string, items: HallMenuItem[]) => setOpen({ x, y, label, items }),
    [],
  );
  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  };
  useEffect(() => cancelHold, []);

  /** Spread on the element that owns the menu. */
  const bind = (label: string, items: () => HallMenuItem[]) => ({
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      cancelHold();
      show(event.clientX, event.clientY, label, items());
    },
    onPointerDown: (event: ReactPointerEvent) => {
      held.current = false;
      if (event.button !== 0) return;
      cancelHold();
      const { clientX: x, clientY: y } = event;
      hold.current = {
        x,
        y,
        timer: setTimeout(() => {
          held.current = true;
          hold.current = null;
          show(x, y, label, items());
        }, HOLD_MS),
      };
    },
    onPointerMove: (event: ReactPointerEvent) => {
      const start = hold.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) cancelHold();
    },
    onPointerUp: cancelHold,
    onPointerLeave: cancelHold,
    onClickCapture: (event: React.MouseEvent) => {
      if (!held.current) return;
      held.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  });

  // Above every layout box (rows scroll and transform); inside the fullscreen element when
  // there is one, or it would not show.
  const menu = open
    ? createPortal(
        <HallMenu {...open} onClose={close} />,
        document.fullscreenElement ?? document.body,
      )
    : null;
  return { menu, bind, show, close };
}

function HallMenu({ x, y, label, items, onClose }: Open & { onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: x, top: y });
  // Keep the whole menu on screen.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setPlace({
      left: Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE)),
      top: Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE)),
    });
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [x, y]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);
  const move = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = [
      ...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };
  return (
    <div
      ref={ref}
      className="hall-context-menu"
      role="menu"
      aria-label={label}
      style={{ left: place.left, top: place.top }}
      onKeyDown={move}
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          className={item.danger ? 'danger' : undefined}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
