import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent,
  type KeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { ChannelEditor } from './CommunitySettings';
import { useCommunity } from './community';
import { leaveVoice, useVoiceContext } from './realtime';
import type { SocialChannel } from '@rooms/social';

type Action = {
  kind: 'create' | 'rename' | 'delete';
  type: 'text' | 'voice';
  channel?: SocialChannel;
};
export function ChannelTools({ children }: { children: ReactNode }) {
  const c = useCommunity(),
    navigate = useNavigate();
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    channel?: SocialChannel;
    type: 'text' | 'voice';
  } | null>(null);
  const [manageChannels, setManageChannels] = useState(false);
  useEffect(() => {
    let alive = true;
    setManageChannels(false);
    if (c.activeSpaceId && window.rooms?.social.communityManagement)
      void window.rooms.social
        .communityManagement(c.activeSpaceId)
        .then((value) => {
          if (alive) setManageChannels(value.capabilities.manageChannels);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [c.serverUrl, c.user?.id, c.activeSpaceId]);
  const [refreshWarning, setRefreshWarning] = useState('');
  const [action, setAction] = useState<Action | null>(null),
    [busy] = useState(false);
  useEffect(() => setRefreshWarning(''), [c.user?.id, c.serverUrl, c.activeSpaceId]);
  const menuRef = useRef<HTMLDivElement>(null),
    origin = useRef<HTMLElement | null>(null);
  const dismiss = useCallback(() => {
    setMenu(null);
    origin.current?.focus();
  }, []);
  const close = useCallback(() => {
    if (!busy) {
      setAction(null);
      origin.current?.focus();
    }
  }, [busy]);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) dismiss();
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        const buttons = [...menuRef.current!.querySelectorAll<HTMLButtonElement>('button')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? buttons.length - 1
              : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        ]?.focus();
      }
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
    };
  }, [menu, dismiss]);
  function show(event: MouseEvent | KeyboardEvent) {
    if (!c.activeSpaceId) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-channel-id],[data-channel-type]',
    );
    if (!target) return;
    event.preventDefault();
    const channel = c.channels.find((ch) => ch.id === target.dataset.channelId),
      rect = target.getBoundingClientRect();
    origin.current = target;
    setMenu({
      channel,
      type: channel?.type === 2 || target.dataset.channelType === 'voice' ? 'voice' : 'text',
      x: Math.max(
        8,
        Math.min('clientX' in event ? event.clientX : rect.left, window.innerWidth - 248),
      ),
      y: Math.max(
        8,
        Math.min('clientY' in event ? event.clientY : rect.bottom, window.innerHeight - 240),
      ),
    });
  }
  function choose(kind: Action['kind'], type = menu!.type) {
    setAction({ kind, type, channel: menu?.channel });
    setMenu(null);
  }
  async function refreshChannels(
    spaceId: string,
    channel: SocialChannel | null,
    deletedId?: string,
  ) {
    const sameAccount = () => {
      const current = useCommunity.getState();
      return current.user?.id === c.user?.id && current.serverUrl === c.serverUrl;
    };
    if (!sameAccount()) return;
    if (deletedId && useVoiceContext.getState().channelId === deletedId) await leaveVoice();
    if (!sameAccount()) return;
    if (channel && useVoiceContext.getState().channelId === channel.id)
      useVoiceContext.setState({ roomName: channel.name });
    // The mutation already succeeded. A refresh failure must not invite duplicate creation.
    const currentChannels = useCommunity.getState().channels;
    if (useCommunity.getState().activeSpaceId === spaceId) {
      const channels = channel
        ? [...currentChannels.filter((item) => item.id !== channel.id), channel]
        : currentChannels.filter((item) => item.id !== deletedId);
      const deletedActive = !!deletedId && useCommunity.getState().activeChannelId === deletedId;
      useCommunity.setState({
        channels,
        ...(deletedActive ? { activeChannelId: null, messages: [] } : {}),
      });
    }
    let channels: SocialChannel[];
    try {
      channels = await window.rooms!.social.channels(spaceId);
      setRefreshWarning('');
    } catch {
      if (sameAccount() && useCommunity.getState().activeSpaceId === spaceId)
        setRefreshWarning(
          deletedId
            ? 'Kanal silindi. Liste yenilenemedi.'
            : 'Kanal kaydedildi. Liste yenilenemedi.',
        );
      return;
    }
    if (!sameAccount() || useCommunity.getState().activeSpaceId !== spaceId) return;
    useCommunity.setState({ channels });
    const active = useCommunity.getState().activeChannelId;
    if (action?.kind === 'create' && channel?.type === 0) {
      await useCommunity.getState().openChannel(channel.id);
      if (sameAccount() && useCommunity.getState().activeSpaceId === spaceId) navigate('/chat');
    } else if (active && !channels.some((ch) => ch.id === active)) {
      const next = channels.find((ch) => ch.type === 0);
      if (next) await useCommunity.getState().openChannel(next.id);
      else useCommunity.setState({ activeChannelId: null, messages: [] });
    }
  }
  return (
    <div
      className="channel-tools"
      onClick={(e) => {
        const target = (e.target as HTMLElement).closest<HTMLElement>('[data-create-type]');
        if (target && c.activeSpaceId) {
          origin.current = target;
          setAction({
            kind: 'create',
            type: target.dataset.createType === 'voice' ? 'voice' : 'text',
          });
        }
      }}
      onContextMenu={show}
      onKeyDown={(e) => {
        if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) show(e);
      }}
    >
      {children}
      {refreshWarning && (
        <div className="channel-operation-status" role="status">
          {refreshWarning}
          <button
            onClick={() => {
              setRefreshWarning('');
              void c.openSpace(c.activeSpaceId!);
            }}
          >
            Yenile
          </button>
        </div>
      )}
      {menu &&
        createPortal(
          <div
            className="channel-context-menu"
            ref={menuRef}
            role="menu"
            aria-label="Kanal işlemleri"
            style={{ left: menu.x, top: menu.y }}
          >
            <button role="menuitem" onClick={() => choose('create', 'text')}>
              Metin kanalı oluştur
            </button>
            <button role="menuitem" onClick={() => choose('create', 'voice')}>
              Ses odası oluştur
            </button>
            {menu.channel && (
              <>
                <hr />
                {menu.channel.type !== 2 && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      const id = menu.channel!.id;
                      dismiss();
                      navigate(`/settings?tab=desktop&channel=${encodeURIComponent(id)}`);
                    }}
                  >
                    Bildirimler
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => {
                    const id = menu.channel!.id;
                    dismiss();
                    navigate(`/settings?tab=channel-permissions&channel=${encodeURIComponent(id)}`);
                  }}
                >
                  İzinler
                </button>
                <button role="menuitem" onClick={() => choose('rename')}>
                  Adını değiştir
                </button>
                <button className="destructive" role="menuitem" onClick={() => choose('delete')}>
                  Kanalı sil
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
      {action && c.spaces.find((space) => space.id === c.activeSpaceId) && (
        <ChannelEditor
          mode={action.kind}
          space={c.spaces.find((space) => space.id === c.activeSpaceId)!}
          channel={action.channel}
          initialType={action.type}
          canManage={
            manageChannels ||
            c.spaces.find((space) => space.id === c.activeSpaceId)?.ownerId === c.user?.id
          }
          onClose={close}
          onCreate={
            window.rooms
              ? async (spaceId, name, type) => {
                  const channel = await window.rooms!.social.createChannel(spaceId, name, type);
                  await refreshChannels(spaceId, channel);
                  return channel;
                }
              : undefined
          }
          onRename={
            window.rooms
              ? async (channelId, name) => {
                  const spaceId = c.activeSpaceId!;
                  const channel = await window.rooms!.social.renameChannel(channelId, name);
                  await refreshChannels(spaceId, channel);
                  return channel;
                }
              : undefined
          }
          onDelete={
            window.rooms
              ? async (channelId) => {
                  const spaceId = c.activeSpaceId!;
                  await window.rooms!.social.deleteChannel(channelId);
                  await refreshChannels(spaceId, null, channelId);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
