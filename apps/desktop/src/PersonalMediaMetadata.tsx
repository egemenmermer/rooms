import type { PersonalProgram } from '../electron/provider-contracts';

/** Display only provider dates and positions that crossed the native boundary. */
export function addedDate(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Belirtilmedi';
  return new Date(value).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
export function resumePosition(value?: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 604800
    ? value
    : null;
}
export function resumeLabel(value?: number): string {
  const position = resumePosition(value);
  if (position === null) return 'Kayıtlı konum yok';
  if (position === 0) return 'Henüz başlamadın';
  const seconds = Math.floor(position),
    hours = Math.floor(seconds / 3600);
  return `${hours ? `${hours}:` : ''}${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} kayıtlı`;
}
export function CurrentProgram({
  programs,
  now,
  fallback,
}: {
  programs?: PersonalProgram[];
  now: number;
  fallback: string;
}) {
  const current = programs?.find((program) => {
    const start = Date.parse(program.startsAt),
      end = Date.parse(program.endsAt);
    return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
  });
  if (!current) return <small>{fallback}</small>;
  const time = (value: string) =>
    new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const elapsed = Math.max(
    0,
    Math.min(
      1,
      (now - Date.parse(current.startsAt)) /
        (Date.parse(current.endsAt) - Date.parse(current.startsAt)),
    ),
  );
  return (
    <div className="ref-media-current-program">
      <small>{current.title}</small>
      <div>
        <time>
          {time(current.startsAt)}–{time(current.endsAt)}
        </time>
        <progress aria-label={`${current.title} yayın ilerlemesi`} max={1} value={elapsed} />
      </div>
    </div>
  );
}
