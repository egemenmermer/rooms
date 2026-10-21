import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@rooms/design';
import type { SocialChannel } from '@rooms/social';
import { queryClient } from './query-client';
import { useCommunity } from './community';
import { uiError } from './i18n';
import { ParticipantAudioControls } from './ParticipantAudioMenu';
import { useRealtime } from './realtime';

export const VOICE_MEMBER_DRAG = 'application/x-rooms-voice-member';
export interface VoiceMemberTarget {
  id: string;
  name: string;
  /** The voice room this person is in. */
  from: string;
}
export interface ModerationRights {
  moveMembers: boolean;
  kickMembers: boolean;
  banMembers: boolean;
  /** Owner or owner-equivalent admin (a role with every permission); see `communityAdmin`. */
  communityAdmin: boolean;
}
const none: ModerationRights = {
  moveMembers: false,
  kickMembers: false,
  banMembers: false,
  communityAdmin: false,
};

/** This account's moderation rights in the community; nothing while unknown or offline. */
export function useModerationRights(spaceId: string | null): ModerationRights {
  const user = useCommunity((s) => s.user?.id),
    server = useCommunity((s) => s.serverUrl);
  const [rights, setRights] = useState<{ key: string; value: ModerationRights } | null>(null),
    [epoch, setEpoch] = useState(0);
  const key = JSON.stringify([server, user, spaceId]);
  useEffect(() => {
    const read = window.rooms?.social.communityCapabilities;
    if (!spaceId || !user || !read) return;
    let active = true;
    void queryClient
      .fetchQuery({
        queryKey: ['community-capabilities', key],
        staleTime: 60_000,
        queryFn: () => read(spaceId),
      })
      .then((value) => {
        if (active)
          setRights({
            key,
            value: {
              moveMembers: !!value.moveMembers,
              kickMembers: value.kickMembers,
              banMembers: !!value.banMembers,
              communityAdmin: !!value.communityAdmin,
            },
          });
      })
      .catch(() => {
        /* Unknown rights hide moderation; the server still checks every action. */
      });
    return () => {
      active = false;
    };
  }, [key, spaceId, user, epoch]);
  useEffect(() => {
    // Role changes arrive as channel access invalidations; rights are read again after them.
    const forget = () => {
      queryClient.removeQueries({ queryKey: ['community-capabilities', key] });
      setEpoch((n) => n + 1);
    };
    window.addEventListener('rooms:channel-access-invalidated', forget);
    return () => window.removeEventListener('rooms:channel-access-invalidated', forget);
  }, [key]);
  return rights?.key === key ? rights.value : none;
}

/** Moves someone to another voice room; their client joins it through the normal room check. */
export async function moveVoiceMember(target: VoiceMemberTarget, to: string) {
  if (!window.rooms?.media.moderate) throw Error('Masaüstü uygulaması gerekiyor.');
  await window.rooms.media.moderate({
    channelId: target.from,
    userId: target.id,
    action: 'move',
    targetChannelId: to,
  });
}

type Confirm = 'disconnect' | 'kick' | 'ban';
const confirmText: Record<Confirm, { title: string; body: string; action: string }> = {
  disconnect: {
    title: 'Sesten çıkar',
    body: 'ses odasından çıkarılacak. İsterse yeniden katılabilir.',
    action: 'Sesten çıkar',
  },
  kick: {
    title: 'Topluluktan çıkar',
    body: 'topluluktan çıkarılacak. Yeni bir davetle geri dönebilir.',
    action: 'Topluluktan çıkar',
  },
  ban: {
    title: 'Yasakla',
    body: 'topluluktan çıkarılıp yasaklanacak. Yasak kaldırılana kadar geri dönemez.',
    action: 'Yasakla',
  },
};

/**
 * Right-click menu for a person in a voice room: this listener's volume for them when they are
 * heard here, then only the actions this account may take.
 */
export function VoiceMemberMenu({
  target,
  x,
  y,
  rooms,
  rights,
  onProfile,
  onClose,
  notify,
}: {
  target: VoiceMemberTarget;
  x: number;
  y: number;
  rooms: SocialChannel[];
  rights: ModerationRights;
  onProfile(): void;
  onClose(): void;
  notify(message: string): void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    spaceId = useCommunity((s) => s.activeSpaceId),
    voice = useRealtime();
  // Volume is local playback: only someone heard in the room this listener is connected to.
  const heard =
    voice.status === 'connected' && voice.channelId === target.from
      ? voice.participants.find((p) => p.id === target.id && !p.local)
      : undefined;
  const [confirm, setConfirm] = useState<Confirm | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  // Callers pass a new onClose each render (volume changes re-render them); focus stays put.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (confirm) return;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [confirm]);
  const others = rooms.filter((room) => room.id !== target.from);
  const act = async (task: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError('');
    try {
      await task();
      notify(done);
      onClose();
    } catch (failure) {
      setError(uiError(failure));
    } finally {
      setBusy(false);
    }
  };
  const run = (kind: Confirm) =>
    act(
      () =>
        kind === 'disconnect'
          ? window.rooms!.media.moderate!({
              channelId: target.from,
              userId: target.id,
              action: 'disconnect',
            })
          : kind === 'kick'
            ? window.rooms!.social.removeCommunityMember({ spaceId: spaceId!, userId: target.id })
            : window.rooms!.social.banCommunityMember!({ spaceId: spaceId!, userId: target.id }),
      kind === 'disconnect'
        ? `${target.name} sesten çıkarıldı.`
        : kind === 'kick'
          ? `${target.name} topluluktan çıkarıldı.`
          : `${target.name} yasaklandı.`,
    );
  if (confirm)
    return (
      <Modal
        title={confirmText[confirm].title}
        onClose={onClose}
        className="voice-moderation-confirm"
      >
        <p>
          <strong>{target.name}</strong> {confirmText[confirm].body}
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="button-row">
          <button className="button secondary" disabled={busy} onClick={onClose}>
            Vazgeç
          </button>
          <button className="button danger" disabled={busy} onClick={() => void run(confirm)}>
            {busy ? 'Yapılıyor…' : confirmText[confirm].action}
          </button>
        </div>
      </Modal>
    );
  return createPortal(
    <div
      className="channel-context-menu voice-member-menu"
      ref={ref}
      role="menu"
      aria-label={`${target.name} için işlemler`}
      style={{
        left: Math.max(8, Math.min(x, window.innerWidth - 248)),
        top: Math.max(8, Math.min(y, window.innerHeight - (heard ? 460 : 320))),
      }}
    >
      {heard && (
        <>
          <div
            className="voice-member-audio"
            role="group"
            aria-label={`${heard.name} ses kontrolü`}
          >
            <ParticipantAudioControls person={heard} />
          </div>
          <hr />
        </>
      )}
      <button
        role="menuitem"
        onClick={() => {
          onProfile();
          onClose();
        }}
      >
        Profili aç
      </button>
      {rights.moveMembers && others.length > 0 && (
        <>
          <hr />
          <small className="voice-member-menu-label">Odaya taşı</small>
          {others.map((room) => (
            <button
              key={room.id}
              role="menuitem"
              disabled={busy}
              onClick={() =>
                void act(
                  () => moveVoiceMember(target, room.id),
                  `${target.name}, ${room.name} odasına taşındı.`,
                )
              }
            >
              {room.name}
            </button>
          ))}
        </>
      )}
      {(rights.moveMembers || rights.kickMembers || rights.banMembers) && <hr />}
      {rights.moveMembers && (
        <button role="menuitem" className="destructive" onClick={() => setConfirm('disconnect')}>
          Sesten çıkar
        </button>
      )}
      {rights.kickMembers && (
        <button role="menuitem" className="destructive" onClick={() => setConfirm('kick')}>
          Topluluktan çıkar
        </button>
      )}
      {rights.banMembers && window.rooms?.social.banCommunityMember && (
        <button role="menuitem" className="destructive" onClick={() => setConfirm('ban')}>
          Yasakla
        </button>
      )}
      {error && (
        <p className="voice-member-menu-error" role="alert">
          {error}
        </p>
      )}
    </div>,
    document.body,
  );
}
