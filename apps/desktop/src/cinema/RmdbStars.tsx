import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Heart, Star, X } from 'lucide-react';
import type { RmdbRating } from '../../../../packages/community-cinema/src/types';
import { starsLabel, starsText } from './rmdb-model';
import { t } from '../i18n';

const FIVE = [0, 1, 2, 3, 4];

const fillOf = (steps: number, index: number) => {
  const value = Math.max(0, Math.min(2, steps - index * 2));
  return value === 2 ? 'full' : value === 1 ? 'half' : 'empty';
};

function StarShape({ fill }: { fill: 'full' | 'half' | 'empty' }) {
  return (
    <>
      <Star className="rmdb-star-back" aria-hidden="true" />
      {fill !== 'empty' && (
        <Star className="rmdb-star-front" fill="currentColor" aria-hidden="true" />
      )}
    </>
  );
}

/** Five stars with halves; an average rounds to the nearest half step. */
export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  const steps = Math.max(0, Math.min(10, Math.round(rating)));
  return (
    <span
      className="rmdb-stars"
      role="img"
      aria-label={steps ? starsLabel(steps) : t('Puan yok')}
      style={{ '--star': `${size}px` } as CSSProperties}
    >
      {FIVE.map((index) => (
        <span key={index} className="rmdb-star" data-fill={fillOf(steps, index)}>
          <StarShape fill={fillOf(steps, index)} />
        </span>
      ))}
    </span>
  );
}

/**
 * The half-star rating picker: each star has a left (½) and right (full) half. Pointer hover
 * previews; ←/→ move by half a star, Home/End jump, Delete clears.
 */
export function StarPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: RmdbRating | null;
  onChange(value: RmdbRating | null): void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState<RmdbRating | null>(null);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = hover ?? value ?? 0;
  const pick = (next: RmdbRating | null, focus: boolean) => {
    onChange(next);
    if (focus) radios.current[(next ?? 1) - 1]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: RmdbRating | null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = Math.min(10, (value ?? 0) + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = value === null ? null : Math.max(1, value - 1);
        break;
      case 'Home':
        next = 1;
        break;
      case 'End':
        next = 10;
        break;
      case 'Delete':
      case 'Backspace':
        next = null;
        break;
      default:
        return;
    }
    event.preventDefault();
    pick(next, true);
  };
  return (
    <div className="rmdb-picker-wrap">
      <div
        className="rmdb-picker"
        role="radiogroup"
        aria-label={t('Puanın')}
        aria-disabled={disabled || undefined}
        style={{ '--star': '26px' } as CSSProperties}
        onKeyDown={disabled ? undefined : onKeyDown}
        onPointerLeave={() => setHover(null)}
      >
        {FIVE.map((index) => (
          <span key={index} className="rmdb-star" data-fill={fillOf(shown, index)}>
            <StarShape fill={fillOf(shown, index)} />
            {[1, 2].map((half) => {
              const step = index * 2 + half;
              const checked = value === step;
              return (
                <button
                  key={half}
                  ref={(element) => {
                    radios.current[step - 1] = element;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={starsLabel(step)}
                  className={`rmdb-half ${half === 1 ? 'left' : 'right'}`}
                  tabIndex={checked || (value === null && step === 1) ? 0 : -1}
                  disabled={disabled}
                  onPointerEnter={() => setHover(step)}
                  onClick={() => pick(step, false)}
                />
              );
            })}
          </span>
        ))}
      </div>
      <span className="rmdb-picker-value" aria-hidden="true">
        {shown ? `${starsText(shown)} / 5` : t('Puan ver')}
      </span>
      {value !== null && !disabled && (
        <button
          type="button"
          className="hall-icon-button rmdb-clear"
          aria-label={t('Puanı temizle')}
          title={t('Puanı temizle (Delete)')}
          onClick={() => pick(null, false)}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** The heart: a toggle whose name stays "Beğen" while `aria-pressed` says whether it is on. */
export function HeartButton({
  liked,
  disabled = false,
  onToggle,
}: {
  liked: boolean;
  disabled?: boolean;
  onToggle(): void;
}) {
  return (
    <button
      type="button"
      className={`rmdb-heart ${liked ? 'liked' : ''}`}
      aria-pressed={liked}
      aria-label={t('Beğen')}
      title={liked ? t('Beğendin · geri almak için tıkla') : t('Beğen')}
      disabled={disabled}
      onClick={onToggle}
    >
      <Heart size={17} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  );
}
