import type { CommunityMessage } from './community';
export interface ConversationEntry {
  messages: CommunityMessage[];
  hasOlder: boolean;
  fetchedAt: number;
}
/** Account-scoped, bounded hot cache. Native storage owns durable encryption. */
export class ConversationCache {
  private entries = new Map<string, ConversationEntry>();
  get(id: string) {
    const entry = this.entries.get(id);
    if (entry) {
      this.entries.delete(id);
      this.entries.set(id, entry);
    }
    return entry;
  }
  put(id: string, entry: ConversationEntry) {
    this.entries.delete(id);
    this.entries.set(id, { ...entry, messages: entry.messages.slice(-200) });
    while (this.entries.size > 20) this.entries.delete(this.entries.keys().next().value!);
  }
  remove(id: string) {
    this.entries.delete(id);
  }
  clear() {
    this.entries.clear();
  }
}
/** Apply changes received during a request without resurrecting deleted messages. */
export function reconcileMessages(
  fetched: CommunityMessage[],
  before: CommunityMessage[],
  current: CommunityMessage[],
) {
  const initial = new Map(before.map((message) => [message.id, message]));
  const latest = new Map(current.map((message) => [message.id, message]));
  const oldestFetched = Math.min(...fetched.map((message) => Date.parse(message.timestamp)));
  const result = new Map(
    current
      .filter((message) => fetched.length > 0 && Date.parse(message.timestamp) < oldestFetched)
      .map((message) => [message.id, message]),
  );
  for (const message of fetched) result.set(message.id, message);
  for (const message of before) if (!latest.has(message.id)) result.delete(message.id);
  for (const message of current)
    if (
      message.delivery === 'pending' ||
      message.delivery === 'failed' ||
      initial.get(message.id) !== message
    )
      result.set(message.id, message);
  return [...result.values()]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-1000);
}
