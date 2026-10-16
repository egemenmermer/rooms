import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SocialUser } from '@rooms/social';
import { useCommunity } from './community';
import { queryClient } from './query-client';
import {
  deserializeMentions,
  editMentionBindings,
  serializeMentions,
  type MentionBinding,
} from './mentions';
export function useMentionInput(value: string, setValue: (value: string) => void) {
  const c = useCommunity(),
    input = useRef<HTMLTextAreaElement>(null),
    bindings = useRef<MentionBinding[]>([]),
    previous = useRef(value);
  const [caret, setCaret] = useState(0),
    [index, setIndex] = useState(0),
    [dismissed, setDismissed] = useState('');
  const match = value.slice(0, caret).match(/(?:^|\s)@([\p{L}\p{N}_-]*)$/u);
  const query = match?.[1] ?? null,
    signature = `${value}:${caret}`,
    open = query !== null && signature !== dismissed;
  const channel = [...c.channels, ...c.dms].find((x) => x.id === c.activeChannelId);
  const memberSpace = channel?.spaceId ?? null;
  const pickerId = useId();
  const key = [c.serverUrl, c.user?.id, memberSpace, c.activeChannelId].join(':');
  const members = useQuery(
    {
      queryKey: ['mention-members', key],
      enabled:
        (open || c.messages.some((m) => /<@[A-Za-z0-9_-]+>/.test(m.content))) &&
        !!memberSpace &&
        !!window.rooms?.social.members,
      queryFn: () => window.rooms!.social.members(memberSpace!),
      staleTime: 30000,
      retry: false,
    },
    queryClient,
  );
  const people = [
    ...new Map(
      [
        ...(members.data?.map((m) => m.user) ?? []),
        ...(channel?.recipients ?? []),
        ...c.messages.map((m) => m.author),
        ...(c.user ? [c.user] : []),
      ].map((p) => [p.id, p]),
    ).values(),
  ]
    .filter(
      (p) =>
        query !== null &&
        `${p.displayName} ${p.username}`
          .toLocaleLowerCase('tr')
          .includes(query.toLocaleLowerCase('tr')),
    )
    .slice(0, 8);
  useEffect(() => {
    bindings.current = [];
    setDismissed('');
    setIndex(0);
  }, [key]);
  useEffect(() => {
    bindings.current = editMentionBindings(previous.current, value, bindings.current);
    previous.current = value;
    setIndex(0);
  }, [value]);
  const change = (next: string, cursor: number) => {
    bindings.current = editMentionBindings(previous.current, next, bindings.current);
    previous.current = next;
    setCaret(cursor);
    setValue(next);
    setIndex(0);
  };
  const pick = (person: SocialUser) => {
    if (query === null) return;
    const start = caret - query.length - 1,
      label = `@${person.displayName.replace(/\s+/g, ' ').trim().slice(0, 80) || person.username}`,
      next = value.slice(0, start) + label + ' ' + value.slice(caret);
    const retained = editMentionBindings(value, next, bindings.current);
    bindings.current = [
      ...retained,
      { start, end: start + label.length, text: label, userId: person.id },
    ];
    previous.current = next;
    setValue(next);
    setCaret(start + label.length + 1);
    setDismissed(`${next}:${start + label.length + 1}`);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(start + label.length + 1, start + label.length + 1);
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || event.nativeEvent.isComposing) return false;
    if (event.key === 'Escape') {
      setDismissed(signature);
      event.preventDefault();
      return true;
    }
    if (people.length && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'ArrowDown') setIndex((i) => (i + 1) % people.length);
      else if (event.key === 'ArrowUp') setIndex((i) => (i + people.length - 1) % people.length);
      else pick(people[Math.min(index, people.length - 1)]);
      return true;
    }
    return false;
  };
  useEffect(() => {
    if (open)
      document.getElementById(`${pickerId}-${index}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [index, open, pickerId]);
  const menu = open ? (
    <div className="mention-picker" role="listbox" id={pickerId} aria-label="Etiketlenecek kişiler">
      {members.isLoading ? (
        <span role="status">Kişiler yükleniyor…</span>
      ) : members.error ? (
        <span role="status">Üye listesi alınamadı. Görünen kişilerden seçebilirsin.</span>
      ) : null}
      {!people.length && !members.isLoading ? (
        <span>Eşleşen kişi yok.</span>
      ) : (
        people.map((p, i) => (
          <button
            type="button"
            role="option"
            id={`${pickerId}-${i}`}
            aria-selected={i === index}
            key={p.id}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(p)}
          >
            <strong>{p.displayName}</strong>
            <small>@{p.username}</small>
          </button>
        ))
      )}
    </div>
  ) : null;
  const nameOf = (id: string) =>
    [
      ...(members.data?.map((m) => m.user) ?? []),
      ...(channel?.recipients ?? []),
      ...c.messages.map((m) => m.author),
      ...(c.user ? [c.user] : []),
    ].find((p) => p.id === id)?.displayName;
  /** Replaces the draft with existing message text, keeping its mentions bound. */
  const load = (text: string) => {
    const loaded = deserializeMentions(text, nameOf);
    bindings.current = loaded.bindings;
    previous.current = loaded.text;
    setValue(loaded.text);
    setCaret(loaded.text.length);
    setDismissed(`${loaded.text}:${loaded.text.length}`);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(loaded.text.length, loaded.text.length);
    });
  };
  return {
    load,
    name: (id: string) => members.data?.find((m) => m.user.id === id)?.user.displayName,
    input,
    menuId: pickerId,
    activeOptionId:
      open && people.length ? `${pickerId}-${Math.min(index, people.length - 1)}` : undefined,
    change,
    onKeyDown,
    menu,
    onSelect: () => setCaret(input.current?.selectionStart ?? value.length),
    serialize: () => serializeMentions(value, bindings.current),
    open,
  };
}
