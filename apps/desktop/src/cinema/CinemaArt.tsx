import { useState } from 'react';
import { cinemaArt } from './cinema-bridge';

const ratios = { poster: 2 / 3, wide: 16 / 9 } as const;

/**
 * Provider artwork through the main process, with a calm lettered tile when there is none.
 * Providers often hand a poster where a still belongs (or the other way round); a picture
 * far from the frame's shape is shown whole over a blurred copy of itself instead of being
 * cropped to a sliver.
 */
export function CinemaArt({
  hallId,
  art,
  title,
  shape = 'logo',
  className = '',
}: {
  hallId: string;
  art: string | null | undefined;
  title: string;
  shape?: 'logo' | 'poster' | 'wide';
  className?: string;
}) {
  const src = cinemaArt(hallId, art);
  const [failed, setFailed] = useState<string | null>(null);
  const [fit, setFit] = useState<{ src: string; mismatched: boolean } | null>(null);
  const mismatched = fit?.src === src && fit.mismatched;
  const initials = title
    .replace(/\b(HD|FHD|UHD|4K|TV)\b/gi, '')
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join('')
    .slice(0, shape === 'logo' ? 2 : 3)
    .toLocaleUpperCase('tr');
  return (
    <span
      className={`hall-art ${shape} ${mismatched ? 'letterbox' : ''} ${className}`}
      aria-hidden="true"
    >
      {src && failed !== src ? (
        <>
          {mismatched && <img className="hall-art-blur" src={src} alt="" draggable={false} />}
          <img
            src={src}
            alt=""
            loading="lazy"
            draggable={false}
            onError={() => setFailed(src)}
            onLoad={(event) => {
              if (shape === 'logo') return;
              const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
              if (!width || !height) return;
              const ratio = width / height / ratios[shape];
              setFit({ src, mismatched: ratio < 0.75 || ratio > 1.33 });
            }}
          />
        </>
      ) : (
        <span className="hall-art-fallback">{initials || '·'}</span>
      )}
    </span>
  );
}

/** `[FHD]` style quality badges, outlined like a TV guide. */
export function QualityBadges({ badges, max = 2 }: { badges: string[]; max?: number }) {
  if (!badges.length) return null;
  return (
    <span className="hall-badges">
      {badges.slice(0, max).map((badge) => (
        <span key={badge} className="hall-badge">
          {badge}
        </span>
      ))}
    </span>
  );
}
