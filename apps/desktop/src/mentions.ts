export interface MentionBinding {
  start: number;
  end: number;
  text: string;
  userId: string;
}
/** Preserve identity only while the exact selected text remains unedited. */
export function editMentionBindings(before: string, after: string, bindings: MentionBinding[]) {
  let left = 0,
    right = 0;
  while (left < before.length && left < after.length && before[left] === after[left]) left++;
  while (
    right < before.length - left &&
    right < after.length - left &&
    before[before.length - 1 - right] === after[after.length - 1 - right]
  )
    right++;
  const oldEnd = before.length - right,
    delta = after.length - before.length;
  return bindings
    .flatMap((b) => {
      if (b.end <= left) return [b];
      if (b.start >= oldEnd) return [{ ...b, start: b.start + delta, end: b.end + delta }];
      return [];
    })
    .filter((b) => after.slice(b.start, b.end) === b.text);
}
export function serializeMentions(text: string, bindings: MentionBinding[]) {
  for (const b of [...bindings].sort((a, b) => b.start - a.start))
    if (text.slice(b.start, b.end) === b.text && /^[A-Za-z0-9_-]{1,128}$/.test(b.userId))
      text = text.slice(0, b.start) + `<@${b.userId}>` + text.slice(b.end);
  return text;
}
