export interface Program {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
}
const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
    .slice(0, 4000);
function xmlTime(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);
  if (!match) throw new Error('Invalid XMLTV timestamp.');
  const zone = match[7] ?? '+0000';
  const date = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${zone.slice(0, 3)}:${zone.slice(3)}`;
  if (!Number.isFinite(Date.parse(date))) throw new Error('Invalid XMLTV timestamp.');
  return new Date(date).toISOString();
}
/** Bounded XMLTV subset; DTD/external entities are prohibited and never resolved. */
export function parseEPG(text: string, epgId: string, now = Date.now()): Program[] {
  if (text.length > 5_000_000 || /<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error('Unsupported XMLTV document.');
  const programs: Program[] = [];
  for (const match of text.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/g)) {
    const attrs = Object.fromEntries(
      [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
    );
    if (attrs.channel !== epgId) continue;
    try {
      const startsAt = xmlTime(attrs.start);
      const endsAt = xmlTime(attrs.stop);
      if (Date.parse(endsAt) < now || Date.parse(startsAt) > now + 86400_000) continue;
      programs.push({
        title: decode(match[2].match(/<title\b[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? 'Program'),
        description: decode(match[2].match(/<desc\b[^>]*>([\s\S]*?)<\/desc>/)?.[1] ?? ''),
        startsAt,
        endsAt,
      });
    } catch {
      /* Invalid provider entries do not prevent other valid entries. */
    }
    if (programs.length >= 500) break;
  }
  return programs.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
