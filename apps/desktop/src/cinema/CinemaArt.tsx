import { useState } from 'react';
import { cinemaArt } from './cinema-bridge';

/** Provider artwork through the main process, with a calm lettered tile when there is none. */
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
  const initials = title
    .replace(/\b(HD|FHD|UHD|4K|TV)\b/gi, '')
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join('')
    .slice(0, shape === 'logo' ? 2 : 3)
    .toLocaleUpperCase('tr');
  return (
    <span className={`hall-art ${shape} ${className}`} aria-hidden="true">
      {src && failed !== src ? (
        <img src={src} alt="" loading="lazy" draggable={false} onError={() => setFailed(src)} />
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
