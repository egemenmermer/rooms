import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRealtime, setParticipantVolume } from './realtime';
import { setPersonalSoundMuted, usePersonalSoundMutes } from './personal-sound-mutes';
import './participant-audio-menu.css';
/** Playback controls belong to this listener, never to the server participant. */
export function ParticipantAudioMenu() {
  const voice = useRealtime(),
    [target, setTarget] = useState<{ id: string; x: number; y: number } | null>(null);
  const menu = useRef<HTMLDivElement>(null),
    origin = useRef<HTMLElement | null>(null),
    restore = useRef(new Map<string, number>());
  const live = useRef(voice);
  live.current = voice;
  const person = voice.participants.find((p) => p.id === target?.id && !p.local);
  const soundMuted = usePersonalSoundMutes((state) => !!target && state.muted.includes(target.id));
  useEffect(() => {
    const open = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent &&
        event.key !== 'ContextMenu' &&
        !(event.key === 'F10' && event.shiftKey)
      )
        return;
      const element = (event.target as HTMLElement)?.closest<HTMLElement>(
        '[data-voice-participant-id]',
      );
      const person = live.current.participants.find(
        (p) => p.id === element?.dataset.voiceParticipantId && !p.local,
      );
      if (!element || !person || live.current.status !== 'connected') return;
      event.preventDefault();
      event.stopPropagation();
      origin.current = element;
      const rect = element.getBoundingClientRect(),
        pointer = event instanceof MouseEvent;
      setTarget({
        id: person.id,
        x: Math.max(8, Math.min(innerWidth - 248, pointer ? event.clientX : rect.left)),
        y: Math.max(40, Math.min(innerHeight - 210, pointer ? event.clientY : rect.bottom)),
      });
    };
    document.addEventListener('contextmenu', open);
    document.addEventListener('keydown', open);
    return () => {
      document.removeEventListener('contextmenu', open);
      document.removeEventListener('keydown', open);
    };
  }, []);
  useEffect(() => {
    setTarget(null);
    restore.current.clear();
  }, [voice.channelId]);
  useEffect(() => {
    if (!target) return;
    if (!person || voice.status !== 'connected') {
      setTarget(null);
      return;
    }
    menu.current?.focus();
    const outside = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setTarget(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setTarget(null);
        origin.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
    };
  }, [target, !!person, voice.status]);
  if (!target || !person) return null;
  const volume = (value: number) => {
    if (value > 0) restore.current.set(person.id, value);
    setParticipantVolume(person.id, value);
  };
  return createPortal(
    <div
      ref={menu}
      role="dialog"
      aria-label={`${person.name} ses kontrolü`}
      tabIndex={-1}
      className="participant-audio-menu"
      style={{ left: target.x, top: target.y }}
    >
      <strong>{person.name}</strong>
      <button
        onClick={() => {
          if (person.volume > 0) restore.current.set(person.id, person.volume);
          volume(person.volume === 0 ? (restore.current.get(person.id) ?? 1) : 0);
        }}
      >
        {person.volume === 0 ? 'Sesini aç' : 'Sesini kapat'} <small>Yalnızca bende</small>
      </button>
      {(person.sounds?.enter || person.sounds?.leave || soundMuted) && (
        <button onClick={() => setPersonalSoundMuted(person.id, !soundMuted)}>
          {soundMuted ? 'Giriş sesini aç' : 'Giriş sesini sustur'} <small>Yalnızca bende</small>
        </button>
      )}
      <label>
        Ses düzeyi <span>{Math.round(person.volume * 100)}%</span>
        <input
          aria-label={`${person.name} ses düzeyi`}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={person.volume}
          onChange={(e) => volume(Number(e.target.value))}
        />
      </label>
    </div>,
    document.body,
  );
}
