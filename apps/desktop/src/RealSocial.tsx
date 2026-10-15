import { useMentionInput } from './MentionInput';
import { ChatAttachment } from './ChatAttachment';
import { ScreenShareGallery } from './ScreenShareGallery';
import { VoiceRoomViewActions } from './VoiceRoomViewActions';
import { QuietMenu } from './QuietMenu';
import { openRoomActivity } from './MusicDJ';
import { FriendRequestButton } from './FriendRequestButton';
import { MediaStage } from './MediaStage';
import { watchScreen, setScreenVolume } from './realtime';
export { MediaStage } from './MediaStage';
import './reference-chat.css';
import './reference-voice.css';
import './discord-room.css';
import { ReferenceIcon } from './ReferenceIcon';
import { mediaBridge } from './runtime-sources';
import { SoundboardButton } from './Soundboard';
import { tr, uiError } from './i18n';
import { VoiceAvatar } from './VoiceAvatar';
import { ScreenHandoffControls, cancelScreenHandoff, decideScreenHandoff } from './screen-handoff';
import { MessageReminder } from './Reminder';
import { ChatAgentRequest } from './ChatAgent';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useRooms } from './store';
import { useActivityRoom } from './activity';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Play,
  AlertCircle,
  Bell,
  Download,
  Film,
  Gamepad2,
  Heart,
  MoreHorizontal,
  Pin,
  Search,
  Smile,
  Star,
  AudioLines,
  BookmarkPlus,
  Bot,
  Clock3,
  Paperclip,
  ThumbsUp,
  FileText,
  Check,
  Copy,
  Edit3,
  Hash,
  Headphones,
  Link,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Square,
  Trash2,
  Users,
  Video,
  VideoOff,
  Volume2,
  X,
  Trophy,
  Gem,
  Dice5,
} from 'lucide-react';
import { Avatar, EmptyState, IconButton, Modal } from '@rooms/design';
import type { SocialUser, SocialAttachment } from '@rooms/social';
import { useCommunity, type CommunityMessage } from './community';
import {
  useRealtime,
  joinVoice,
  leaveVoice,
  toggleMic,
  toggleDeafen,
  toggleCamera,
  startScreen,
  stopScreen,
  setParticipantVolume,
  startRoomAudio,
} from './realtime';
const report = (operation: Promise<unknown>, notify: (message: string) => void) => {
  void operation.catch((e) => notify(uiError(e)));
};
export function CommunityChat({
  notify,
  membersVisible,
  onToggleMembers,
  onSearch,
  composerPlaceholder,
}: {
  membersVisible?: boolean;
  onToggleMembers?(): void;
  onSearch?(): void;
  composerPlaceholder?: string;
  notify(message: string): void;
}) {
  const c = useCommunity();
  const [selectedAuthor, setSelectedAuthor] = useState<SocialUser | null>(null);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState('');
  const closeAuthor = useCallback(() => {
    setSelectedAuthor(null);
    setConfirmRemoval(false);
    setMemberError('');
  }, []);
  useEffect(() => {
    const acknowledge = () => {
      const current = useCommunity.getState(),
        last = current.messages.at(-1);
      if (current.activeChannelId && last && !last.id.startsWith('pending-') && document.hasFocus())
        void current.markRead(current.activeChannelId, last.id);
    };
    acknowledge();
    window.addEventListener('focus', acknowledge);
    return () => window.removeEventListener('focus', acknowledge);
  }, [c.activeChannelId]);
  const [draft, setDraft] = useState('');
  const mentionInput = useMentionInput(draft, setDraft);
  const [attachments, setAttachments] = useState<SocialAttachment[]>([]),
    [uploading, setUploading] = useState(false);
  const attach = async () => {
    if (!c.activeChannelId || !window.rooms) return;
    const channelId = c.activeChannelId;
    setUploading(true);
    try {
      const item = await window.rooms.social.chooseAttachment(channelId);
      if (item && useCommunity.getState().activeChannelId === channelId)
        setAttachments((items) => [...items, item].slice(0, 5));
      else if (item) await window.rooms.social.discardAttachment(item.id);
    } catch (error) {
      notify(uiError(error));
    } finally {
      setUploading(false);
    }
  };
  const react = async (message: CommunityMessage, emoji = '1f44d') => {
    if (!c.activeChannelId || !window.rooms) return;
    try {
      await c.reactMessage(message.id, emoji);
    } catch (error) {
      notify(uiError(error));
    }
  };
  const navigate = useNavigate();
  const chatLocation = useLocation();
  useEffect(() => {
    const messageId = new URLSearchParams(chatLocation.search).get('message');
    if (!messageId || c.loadingMessages) return;
    const target = document.getElementById(`message-${messageId}`);
    target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    target?.focus({ preventScroll: true });
  }, [chatLocation.search, c.activeChannelId, c.loadingMessages, c.messages.length]);
  const setPreference = useRooms((s) => s.setPreference);
  const storedFriends = useRooms((s) => s.preferences.showFriends);
  const showFriends = membersVisible ?? storedFriends;
  const voice = useRealtime();
  const activity = useActivityRoom(c.user ? (voice.channelId ?? c.activeChannelId) : null);
  const primary = activity.status === 'connected' ? activity.room?.primary : null;
  const [nameColors, setNameColors] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('fixture'))
      void import('./dev/reference-fixtures').then((f) => {
        if (active) setNameColors(f.getReferenceNameColors());
      });
    return () => {
      active = false;
    };
  }, []);
  const [activityArt, setActivityArt] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('fixture'))
      void import('./dev/reference-fixtures').then(() => {
        if (active) setActivityArt('/__reference/01_brand/cinema-still.svg');
      });
    return () => {
      active = false;
    };
  }, []);
  const activityPath =
    primary?.activity === 'youtube'
      ? '/youtube'
      : primary?.activity === 'screen'
        ? '/voice'
        : primary?.activity === 'cinema'
          ? '/cinema'
          : '/games';
  const [searchOpen, setSearchOpen] = useState(false),
    [query, setQuery] = useState('');
  const [options, setOptions] = useState<CommunityMessage | null>(null),
    [reactionTarget, setReactionTarget] = useState<CommunityMessage | null>(null);
  const [reply, setReply] = useState<CommunityMessage | null>(null),
    [replyText, setReplyText] = useState('');
  const [actionBusy, setActionBusy] = useState(false),
    [actionError, setActionError] = useState('');
  const unreadAnchor = useRef<string | null>(null);
  const previousChannel = useRef<string | null>(null);
  if (previousChannel.current !== c.activeChannelId) {
    previousChannel.current = c.activeChannelId;
    unreadAnchor.current =
      c.activeChannelId && c.unread[c.activeChannelId]
        ? (c.readStates[c.activeChannelId]?.lastReadMessageId ?? null)
        : null;
  }
  const closeOptions = useCallback(() => setOptions(null), []);
  const closeReactions = useCallback(() => setReactionTarget(null), []);
  const closeReply = useCallback(() => {
    setReply(null);
    setReplyText('');
    setActionError('');
  }, []);
  const saveEdit = async () => {
    if (!editing || !edit.trim() || actionBusy) return;
    setActionBusy(true);
    setActionError('');
    try {
      await c.editMessage(editing.id, edit.trim());
      closeEdit();
    } catch (error) {
      setActionError(uiError(error));
    } finally {
      setActionBusy(false);
    }
  };
  const sendReply = async () => {
    if (!reply || !replyText.trim() || actionBusy) return;
    setActionBusy(true);
    setActionError('');
    try {
      await c.send(
        `> ${reply.author.displayName || reply.author.username}: ${reply.content.slice(0, 400).replace(/\n/g, '\n> ')}\n\n${replyText.trim()}`,
      );
      closeReply();
    } catch (error) {
      setActionError(uiError(error));
    } finally {
      setActionBusy(false);
    }
  };
  const [reminder, setReminder] = useState<CommunityMessage | null>(null);
  const closeReminder = useCallback(() => setReminder(null), []);
  const [agentPrompt, setAgentPrompt] = useState<string | null>(null);
  const closeAgent = useCallback(() => setAgentPrompt(null), []);
  const saveMemory = (message: CommunityMessage) => {
    if (!c.activeChannelId || !window.rooms?.agent) return;
    report(
      window.rooms.agent
        .saveMemory({
          roomId: c.activeChannelId,
          text: message.content,
          sourceMessageId: message.id,
        })
        .then(() => notify(tr('Mesaj oda haf\u0131zas\u0131na kaydedildi.'))),
      notify,
    );
  };
  const [editing, setEditing] = useState<CommunityMessage | null>(null);
  const [edit, setEdit] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const channel =
    c.channels.find((ch) => ch.id === c.activeChannelId) ??
    c.dms.find((ch) => ch.id === c.activeChannelId);
  const closeEdit = useCallback(() => setEditing(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);
  useEffect(() => {
    setOptions(null);
    setReactionTarget(null);
    setReply(null);
    setEditing(null);
    setDeleting(null);
    setActionError('');
    setQuery('');
  }, [c.activeChannelId]);
  useEffect(() => {
    nearBottom.current = true;
    setUnseen(false);
    setAttachments([]);
  }, [c.activeChannelId]);
  useEffect(() => {
    if (nearBottom.current && log.current) log.current.scrollTop = log.current.scrollHeight;
    else setUnseen(true);
  }, [c.activeChannelId, c.messages.length, c.messages.at(-1)?.id]);
  const send = () => {
    if (!draft.trim() && !attachments.length) return;
    const content = mentionInput.serialize().trim();
    if (content.length > 4000) {
      notify('Mesaj çok uzun. Biraz kısaltıp yeniden dene.');
      return;
    }
    report(
      c.send(content, attachments).then(async () => {
        if (!/^@agent(?:\s|$)/i.test(content)) return;
        const capabilities =
          (await window.rooms?.agent.status().catch(() => null))?.capabilities ?? [];
        if (
          !capabilities.includes('stoat-mentions') &&
          /^@agent(?:\s|$)/i.test(content) &&
          content.replace(/^@agent\s*/i, '').trim()
        )
          setAgentPrompt(content.replace(/^@agent\s*/i, '').trim());
      }),
      notify,
    );
    setDraft('');
    setAttachments([]);
    nearBottom.current = true;
  };
  const typingSent = useRef<{ channel: string; time: number } | null>(null);
  const [typingClock, setTypingClock] = useState(Date.now());
  const [fixtureTyping, setFixtureTyping] = useState<SocialUser[]>([]);
  useEffect(() => {
    let active = true;
    setFixtureTyping([]);
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('fixture'))
      void import('./dev/reference-fixtures').then((f) => {
        if (active && c.activeChannelId)
          setFixtureTyping(f.getReferenceTypingUsers(c.activeChannelId));
      });
    return () => {
      active = false;
    };
  }, [c.activeChannelId]);
  const typingUsers = fixtureTyping.length
    ? fixtureTyping
    : Object.values(c.typing[c.activeChannelId ?? ''] ?? {})
        .filter((entry) => entry.expiresAt > typingClock)
        .map((entry) => entry.user);
  useEffect(() => {
    if (!typingUsers.length) return;
    const timer = setInterval(() => setTypingClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [typingUsers.length]);
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('fixture')) return;
    const channel = c.activeChannelId;
    if (!channel || !window.rooms || c.status !== 'connected') return;
    const stop = () => {
      if (typingSent.current?.channel === channel) {
        typingSent.current = null;
        void window.rooms?.social.typing(channel, false).catch(() => {});
      }
    };
    if (!draft.trim()) {
      stop();
      return;
    }
    if (typingSent.current?.channel !== channel || Date.now() - typingSent.current.time >= 4000) {
      typingSent.current = { channel, time: Date.now() };
      void window.rooms.social.typing(channel, true).catch(() => {});
    }
    const timer = setTimeout(stop, 3000);
    const blur = () => stop();
    window.addEventListener('blur', blur);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('blur', blur);
    };
  }, [draft, c.activeChannelId, c.status]);
  useEffect(
    () => () => {
      const current = typingSent.current;
      typingSent.current = null;
      if (current) void window.rooms?.social.typing(current.channel, false).catch(() => {});
    },
    [c.activeChannelId],
  );
  const visibleMessages = c.messages.filter(
    (m) =>
      !query ||
      `${m.content} ${m.author.displayName} ${m.attachments?.map((a) => a.name).join(' ') ?? ''}`
        .toLocaleLowerCase('tr')
        .includes(query.toLocaleLowerCase('tr')),
  );
  const reactionOptions = [
    { id: '2764', label: 'Kalp', icon: Heart },
    { id: '2714', label: 'Onay', icon: Check },
    { id: '2b50', label: 'Yıldız', icon: Star },
    { id: '1f642', label: 'Gülümseme', icon: Smile },
    { id: '1f3ae', label: 'Oyun', icon: Gamepad2 },
    { id: '1f3ac', label: 'Film', icon: Film },
  ];
  const reactionIcon = (key: string) =>
    (
      ({
        heart: Heart,
        '2764': Heart,
        '2764-fe0f': Heart,
        check: Check,
        '2714': Check,
        '2714-fe0f': Check,
        '1f44d': ThumbsUp,
        '2b50': Star,
        '1f642': Smile,
        '1f3ae': Gamepad2,
        '1f3ac': Film,
      }) as Record<string, typeof Heart>
    )[key];
  const messageText = (value: string) =>
    value.split(/(<@[A-Za-z0-9_-]{1,128}>|@[\p{L}\p{N}_-]+)/u).map((part, i) => {
      const id = part.match(/^<@([A-Za-z0-9_-]+)>$/)?.[1];
      const person = id
        ? [c.user, ...c.messages.map((m) => m.author), ...(channel?.recipients ?? [])].find(
            (p) => p?.id === id,
          )
        : null;
      return id ? (
        <mark key={i}>
          @{person?.displayName ?? mentionInput.name(id) ?? `kişi-${id.slice(-6)}`}
        </mark>
      ) : part.startsWith('@') ? (
        <mark key={i}>{part}</mark>
      ) : (
        part
      );
    });
  return (
    <div className="chat-page reference-chat">
      <header className="chat-heading">
        <Hash size={24} />
        <h2>{channel?.name ?? 'Sohbet'}</h2>
        {channel?.topic && (
          <>
            <span className="chat-topic-divider" />
            <p>{channel.topic}</p>
          </>
        )}
        <div className="chat-header-tools">
          <IconButton label="Bildirim ayarları" onClick={() => navigate('/settings?tab=desktop')}>
            <Bell size={19} />
          </IconButton>
          <IconButton label="Sabitlenmiş mesajlar — sunucu bağlantısı desteklemiyor" disabled>
            <Pin size={19} />
          </IconButton>
          <IconButton
            label={showFriends ? 'Üyeler panelini kapat' : 'Üyeler panelini aç'}
            aria-pressed={showFriends}
            onClick={onToggleMembers ?? (() => setPreference('showFriends', !showFriends))}
          >
            <Users size={19} />
          </IconButton>
          <IconButton
            label="Yüklenen mesajlarda ara"
            aria-expanded={searchOpen}
            onClick={
              onSearch ??
              (() => {
                setSearchOpen((v) => !v);
                setQuery('');
              })
            }
          >
            <Search size={19} />
          </IconButton>
        </div>
      </header>
      {searchOpen && (
        <div className="chat-local-search">
          <Search size={16} />
          <input
            autoFocus
            aria-label="Yüklenen mesajlarda ara"
            placeholder="Yüklenen mesajlarda ara"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span>{visibleMessages.length} sonuç</span>
          <IconButton
            label="Aramayı kapat"
            onClick={() => {
              setSearchOpen(false);
              setQuery('');
            }}
          >
            <X size={15} />
          </IconButton>
        </div>
      )}
      {primary && (
        <div className="chat-announcement">
          <Film size={20} />
          <div>
            <strong>
              {primary.activity === 'cinema'
                ? `${voice.roomName ?? 'Oda'}’da film gecesi başladı`
                : primary.title}
            </strong>
            <small>
              {activity.room?.participants
                .filter((p) => p.userId !== c.user?.id)
                .map((p) => p.displayName)
                .join(', ')}
            </small>
          </div>
          <button
            className="button secondary small"
            onClick={() => openRoomActivity(activityPath, navigate)}
          >
            <ArrowRight size={17} />
            Etkinliğe dön
          </button>
        </div>
      )}
      <div
        ref={log}
        className="chat-transcript"
        role="log"
        aria-label="Kanal mesajları"
        onLoadCapture={() => {
          if (nearBottom.current && log.current) log.current.scrollTop = log.current.scrollHeight;
        }}
        onScroll={() => {
          const el = log.current;
          if (el) {
            nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            if (nearBottom.current) setUnseen(false);
          }
        }}
      >
        {c.hasOlder && c.messages.length > 0 && (
          <button
            className="text-button load-older"
            disabled={c.loadingMessages}
            onClick={() => {
              const el = log.current;
              const previousHeight = el?.scrollHeight ?? 0;
              void c.loadOlder().then(() =>
                requestAnimationFrame(() => {
                  if (el) el.scrollTop = el.scrollHeight - previousHeight;
                }),
              );
            }}
          >
            <RefreshCw size={12} />
            {c.loadingMessages ? 'Yükleniyor…' : 'Önceki mesajlar'}
          </button>
        )}
        {!c.messages.length && !c.loadingMessages && (
          <div className="chat-welcome">
            <span>
              <MessageCircle size={40} />
            </span>
            <h2>{channel ? `#${channel.name} kanalına hoş geldin.` : 'Kanal seç'}</h2>
            {channel && (
              <button
                className="button primary"
                onClick={() => {
                  report(c.send('Selam!'), notify);
                }}
              >
                Selam gönder
              </button>
            )}
          </div>
        )}
        {c.loadingMessages && c.messages.length === 0 && (
          <div className="chat-loading" role="status" aria-label="Mesajlar yükleniyor">
            {Array.from({ length: 5 }, (_, i) => (
              <div className="chat-skeleton-message" key={i}>
                <i />
                <div>
                  <span />
                  <b style={{ width: i % 2 ? '90%' : '72%' }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {query && !visibleMessages.length && (
          <p className="chat-search-empty">Yüklenen mesajlarda sonuç yok.</p>
        )}
        {visibleMessages.map((m, index) => {
          const previous = visibleMessages[index - 1];
          const day = new Date(m.timestamp).toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          });
          const newDay =
            !previous ||
            new Date(previous.timestamp).toLocaleDateString('tr-TR') !==
              new Date(m.timestamp).toLocaleDateString('tr-TR');
          const unread = previous?.id === unreadAnchor.current;
          const own = m.author.id === c.user?.id;
          return (
            <Fragment key={m.id}>
              {newDay && (
                <div className="chat-date-divider">
                  <span>{day}</span>
                </div>
              )}
              {unread && (
                <div className="chat-unread-divider">
                  <span>YENİ MESAJLAR</span>
                </div>
              )}
              <article
                id={`message-${m.id}`}
                tabIndex={-1}
                style={
                  {
                    '--message-name-color':
                      nameColors[m.author.id] ||
                      (m.author.id === c.user?.id ? '#b7aeff' : '#dfe2ec'),
                  } as React.CSSProperties
                }
                className={`message ${own ? 'own' : ''}`}
              >
                <VoiceAvatar id={m.author.id} name={m.author.displayName || m.author.username} />
                <div className="message-body">
                  <div className="message-byline">
                    <button
                      className="message-author"
                      title={own ? 'Sen' : 'Üye seçenekleri'}
                      disabled={own}
                      onClick={() => setSelectedAuthor(m.author)}
                    >
                      <strong>{m.author.displayName || m.author.username}</strong>
                    </button>
                    <time dateTime={m.timestamp}>
                      {new Date(m.timestamp)
                        .toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                        .replace(':', '.')}
                    </time>
                    {m.editedTimestamp && <span>düzenlendi</span>}
                  </div>
                  <p>{messageText(m.content)}</p>
                  {!!m.attachments?.length && (
                    <div className="message-attachments">
                      {m.attachments.map((file) => (
                        <ChatAttachment
                          key={`${c.serverUrl}:${c.user?.id}:${file.id}`}
                          file={file}
                          channelId={m.channelId}
                          messageId={m.id}
                        />
                      ))}
                    </div>
                  )}
                  <div className="message-reactions">
                    {Object.entries(m.reactions ?? {})
                      .filter(([, people]) => people.length)
                      .sort(
                        ([left], [right]) =>
                          (reactionOptions.findIndex((item) => item.id === left) < 0
                            ? 99
                            : reactionOptions.findIndex((item) => item.id === left)) -
                          (reactionOptions.findIndex((item) => item.id === right) < 0
                            ? 99
                            : reactionOptions.findIndex((item) => item.id === right)),
                      )
                      .map(([emoji, people]) => {
                        const Reaction = reactionIcon(emoji);
                        return (
                          <button
                            key={emoji}
                            className={`message-reaction ${people.includes(c.user?.id ?? '') ? 'selected' : ''}`}
                            aria-label={`${emoji} reaksiyonu · ${people.length}`}
                            aria-pressed={people.includes(c.user?.id ?? '')}
                            onClick={() => void react(m, emoji)}
                          >
                            {Reaction ? (
                              <Reaction size={14} />
                            ) : (
                              <span>
                                {/^[a-f0-9]+(?:-[a-f0-9]+)*$/i.test(emoji)
                                  ? (() => {
                                      try {
                                        return String.fromCodePoint(
                                          ...emoji.split('-').map((x) => parseInt(x, 16)),
                                        );
                                      } catch {
                                        return emoji;
                                      }
                                    })()
                                  : emoji}
                              </span>
                            )}
                            {people.length}
                          </button>
                        );
                      })}
                  </div>
                  {m.delivery === 'pending' && <span className="message-state">Gönderiliyor…</span>}
                  {m.delivery === 'failed' && (
                    <span className="message-state failed">
                      <AlertCircle size={13} />
                      Mesaj gönderilemedi{' '}
                      <button onClick={() => report(c.retryMessage(m.id), notify)}>
                        Yeniden dene
                      </button>
                    </span>
                  )}
                </div>
                {m.delivery !== 'pending' && m.delivery !== 'failed' && (
                  <div className="message-actions">
                    <IconButton label="Reaksiyon ekle" onClick={() => setReactionTarget(m)}>
                      <Smile size={16} />
                    </IconButton>
                    <IconButton label="Alıntıyla yanıtla" onClick={() => setReply(m)}>
                      <MessageCircle size={16} />
                    </IconButton>
                    <IconButton label="Mesaj seçenekleri" onClick={() => setOptions(m)}>
                      <MoreHorizontal size={16} />
                    </IconButton>
                  </div>
                )}
              </article>
            </Fragment>
          );
        })}
        {primary?.activity === 'cinema' && !query && (
          <article className="chat-active-card" aria-label="Halen açık Cinema etkinliği">
            {activityArt ? (
              <img src={activityArt} alt="" />
            ) : (
              <div className="chat-active-art">
                <Film size={32} />
              </div>
            )}
            <div>
              <span>
                <h4>{primary.title}</h4>
                <p>
                  Cinema ·{' '}
                  {activity.room?.cinema?.sources.filter(
                    (source) =>
                      source.ready &&
                      Date.now() + activity.serverOffsetMs - source.updatedAt < 15000,
                  ).length ?? 0}{' '}
                  kişi hazır
                </p>
              </span>
              <button className="button primary" onClick={() => navigate('/cinema')}>
                <Play size={17} />
                Odaya git
              </button>
            </div>
          </article>
        )}
      </div>
      {unseen && (
        <button
          className="new-messages"
          onClick={() => {
            if (log.current) log.current.scrollTop = log.current.scrollHeight;
            nearBottom.current = true;
            setUnseen(false);
          }}
        >
          Yeni mesajlar ↓
        </button>
      )}
      {c.activeChannelId && (
        <div className="composer-wrap">
          {attachments.length > 0 && (
            <div className="pending-attachments">
              {attachments.map((file) => (
                <span key={file.id}>
                  <Paperclip size={13} />
                  {file.name}
                  <IconButton
                    label="Eki kaldır"
                    onClick={() =>
                      void window.rooms?.social
                        .discardAttachment(file.id)
                        .then(() =>
                          setAttachments((items) => items.filter((f) => f.id !== file.id)),
                        )
                        .catch((e) => notify(uiError(e)))
                    }
                  >
                    <X size={12} />
                  </IconButton>
                </span>
              ))}
            </div>
          )}
          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <IconButton
              label={uploading ? 'Dosya yükleniyor' : 'Dosya ekle'}
              disabled={!c.activeChannelId || uploading || attachments.length >= 5}
              onClick={() => void attach()}
            >
              <Plus size={20} />
            </IconButton>
            {mentionInput.menu}
            <textarea
              ref={mentionInput.input}
              aria-controls={mentionInput.open ? mentionInput.menuId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={mentionInput.activeOptionId}
              aria-expanded={mentionInput.open}
              onSelect={mentionInput.onSelect}
              aria-label="Kanala mesaj yaz"
              rows={1}
              value={draft}
              maxLength={4000}
              disabled={!c.activeChannelId}
              placeholder={
                composerPlaceholder ??
                (channel
                  ? `${channel.type === 0 ? '#' : ''}${channel.name} kanalına mesaj yaz`
                  : 'Kanal seç')
              }
              onChange={(e) => mentionInput.change(e.target.value, e.target.selectionStart)}
              onKeyDown={(e) => {
                if (mentionInput.onKeyDown(e)) return;
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <IconButton
              label="Son mesaja reaksiyon ekle"
              disabled={!c.messages.at(-1) || c.messages.at(-1)?.delivery === 'failed'}
              onClick={() => setReactionTarget(c.messages.at(-1) ?? null)}
            >
              <Smile size={20} />
            </IconButton>
            <IconButton
              label="Asistanı etiketle"
              onClick={() => {
                setDraft((value) => (value.startsWith('@agent') ? value : `@agent ${value}`));
                document
                  .querySelector<HTMLTextAreaElement>('.reference-chat .chat-composer textarea')
                  ?.focus();
              }}
            >
              <Bot size={20} />
            </IconButton>
            <button
              type="submit"
              className="send-button"
              aria-label="Mesajı gönder"
              disabled={(!draft.trim() && !attachments.length) || !c.activeChannelId || uploading}
            >
              <Send size={20} />
            </button>
          </form>
          <div className="composer-foot">
            {typingUsers.length > 0 && (
              <span className="chat-typing" role="status">
                <span aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {typingUsers.map((u) => u.displayName || u.username).join(', ')} yazıyor…
              </span>
            )}
          </div>
        </div>
      )}
      {reminder && c.activeChannelId && (
        <MessageReminder
          message={reminder}
          roomId={reminder.channelId}
          channelName={channel?.name ?? 'Sohbet'}
          onClose={closeReminder}
          notify={notify}
        />
      )}
      {agentPrompt && c.activeChannelId && (
        <ChatAgentRequest
          roomId={c.activeChannelId}
          prompt={agentPrompt}
          onClose={closeAgent}
          notify={notify}
        />
      )}
      {selectedAuthor && (
        <Modal
          title={
            confirmRemoval
              ? tr('Remove this member?')
              : selectedAuthor.displayName || selectedAuthor.username
          }
          onClose={closeAuthor}
        >
          <div className="profile-preview">
            <Avatar name={selectedAuthor.displayName || selectedAuthor.username} size="large" />
            <div>
              <h3>{selectedAuthor.displayName || selectedAuthor.username}</h3>
              <span className="small-tag">{tr('PRIVATE COMMUNITY MEMBER')}</span>
            </div>
          </div>
          {confirmRemoval ? (
            <>
              <p className="modal-description">
                {tr('Remove') + ' '}
                {selectedAuthor.displayName || selectedAuthor.username}
                {' ' + tr('from') + ' '}
                {c.spaces.find((s) => s.id === c.activeSpaceId)?.name}
                {tr(
                  '? They will need a new invitation to return. The server verifies your permission.',
                )}
              </p>
              <div className="button-row">
                <button
                  className="button secondary"
                  disabled={memberBusy}
                  onClick={() => setConfirmRemoval(false)}
                >
                  {tr('Keep member')}
                </button>
                <button
                  className="button danger"
                  disabled={memberBusy}
                  onClick={() => {
                    setMemberBusy(true);
                    void window
                      .rooms!.social.removeMember(c.activeSpaceId!, selectedAuthor.id)
                      .then(() => {
                        notify(tr('Member removed from this private space.'));
                        closeAuthor();
                      })
                      .catch((e) => setMemberError(uiError(e)))
                      .finally(() => setMemberBusy(false));
                  }}
                >
                  {memberBusy ? tr('Removing\u2026') : tr('Remove member')}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                className="button primary full"
                disabled={memberBusy}
                onClick={() => {
                  setMemberBusy(true);
                  void c
                    .createDM(selectedAuthor.id)
                    .then(closeAuthor)
                    .catch((e) => setMemberError(uiError(e)))
                    .finally(() => setMemberBusy(false));
                }}
              >
                <MessageCircle size={16} />
                {tr('Open direct message')}
              </button>
              <FriendRequestButton key={selectedAuthor.id} user={selectedAuthor} />
              <div className="member-actions">
                <button
                  className="button secondary small"
                  disabled={memberBusy}
                  onClick={() => {
                    setMemberBusy(true);
                    void window
                      .rooms!.social.blockUser(selectedAuthor.id)
                      .then(() =>
                        notify(tr('Member blocked. Your server applies the relationship.')),
                      )
                      .catch((e) => setMemberError(uiError(e)))
                      .finally(() => setMemberBusy(false));
                  }}
                >
                  {tr('Block member')}
                </button>
                <button
                  className="button secondary small"
                  disabled={memberBusy}
                  onClick={() => {
                    setMemberBusy(true);
                    void window
                      .rooms!.social.unblockUser(selectedAuthor.id)
                      .then(() => notify(tr('Member unblocked.')))
                      .catch((e) => setMemberError(uiError(e)))
                      .finally(() => setMemberBusy(false));
                  }}
                >
                  {tr('Unblock member')}
                </button>
              </div>
              {c.spaces.find((s) => s.id === c.activeSpaceId)?.ownerId === c.user?.id && (
                <button
                  className="button secondary full destructive"
                  disabled={memberBusy}
                  onClick={() => setConfirmRemoval(true)}
                >
                  <Trash2 size={15} />
                  {tr('Remove from this space')}
                </button>
              )}
            </>
          )}
          {memberError && (
            <div className="error-pane" role="alert">
              <p>{memberError}</p>
            </div>
          )}
        </Modal>
      )}
      {options && (
        <Modal
          title="Mesaj seçenekleri"
          className="chat-message-modal chat-options-modal"
          onClose={closeOptions}
        >
          <div className="chat-modal-body chat-option-list">
            <button
              onClick={() => {
                setReply(options);
                closeOptions();
              }}
            >
              <MessageCircle size={20} />
              Alıntıyla yanıtla
            </button>
            <button
              disabled={options.author.id !== c.user?.id}
              title={
                options.author.id !== c.user?.id
                  ? 'Yalnızca kendi mesajını düzenleyebilirsin'
                  : undefined
              }
              onClick={() => {
                setEditing(options);
                setEdit(options.content);
                setActionError('');
                closeOptions();
              }}
            >
              <Edit3 size={20} />
              Düzenle
            </button>
            <button
              onClick={() => {
                setReactionTarget(options);
                closeOptions();
              }}
            >
              <Smile size={20} />
              Reaksiyon ekle
            </button>
            <button disabled title="Mesaj bağlantısı sözleşmesi bu sunucu bağlantısında yok">
              <Copy size={20} />
              Mesaj bağlantısını kopyala
            </button>
            <button disabled title="Mesaj sabitleme bu sunucu bağlantısında desteklenmiyor">
              <Pin size={20} />
              Mesajı sabitle
            </button>
            <button
              disabled={options.author.id !== c.user?.id}
              title={
                options.author.id !== c.user?.id
                  ? 'Yalnızca kendi mesajını silebilirsin'
                  : undefined
              }
              onClick={() => {
                setDeleting(options.id);
                setActionError('');
                closeOptions();
              }}
            >
              <Trash2 size={20} />
              Mesajı sil
            </button>
            <div className="chat-extra-actions">
              <button
                onClick={() => {
                  setAgentPrompt(options.content);
                  closeOptions();
                }}
              >
                <Bot size={16} />
                Asistana gönder
              </button>
              <button
                onClick={() => {
                  setReminder(options);
                  closeOptions();
                }}
              >
                <Clock3 size={16} />
                Hatırlat
              </button>
              <button
                onClick={() => {
                  saveMemory(options);
                  closeOptions();
                }}
              >
                <BookmarkPlus size={16} />
                Oda hafızasına kaydet
              </button>
            </div>
          </div>
          <footer className="chat-modal-footer">
            <button className="button subtle" onClick={closeOptions}>
              Kapat
            </button>
          </footer>
        </Modal>
      )}
      {reactionTarget && (
        <Modal
          title="Bir reaksiyon bırak"
          className="chat-message-modal chat-reactions-modal"
          onClose={closeReactions}
        >
          <div className="chat-modal-body chat-reaction-grid">
            {reactionOptions.map((option) => (
              <button
                key={option.id}
                aria-label={`${option.label} reaksiyonunu ekle`}
                onClick={() => {
                  void react(reactionTarget, option.id);
                  closeReactions();
                }}
              >
                <option.icon size={30} />
              </button>
            ))}
          </div>
          <footer className="chat-modal-footer">
            <button className="button subtle" onClick={closeReactions}>
              Kapat
            </button>
          </footer>
        </Modal>
      )}
      {reply && (
        <Modal
          title={`${reply.author.displayName || reply.author.username} kişisine yanıtla`}
          className="chat-message-modal chat-reply-modal"
          onClose={closeReply}
        >
          <div className="chat-modal-body">
            <blockquote>
              {reply.author.displayName || reply.author.username} · {reply.content}
            </blockquote>
            <textarea
              className="edit-textarea"
              aria-label="Alıntılı yanıt"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              maxLength={3500}
            />
            <small>Yanıt alıntı metni olarak gönderilir.</small>
            {actionError && (
              <div className="error-pane" role="alert">
                {actionError}
              </div>
            )}
          </div>
          <footer className="chat-modal-footer">
            <button
              className="button primary"
              disabled={actionBusy || !replyText.trim()}
              onClick={() => void sendReply()}
            >
              <Send size={18} />
              Yanıt gönder
            </button>
          </footer>
        </Modal>
      )}
      {editing && (
        <Modal
          title="Mesajı düzenle"
          className="chat-message-modal chat-edit-modal"
          onClose={closeEdit}
        >
          <div className="chat-modal-body">
            <textarea
              className="edit-textarea"
              aria-label="Mesaj metni"
              value={edit}
              onChange={(e) => setEdit(e.target.value)}
              maxLength={4000}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void saveEdit();
                }
              }}
            />
            <p>Enter ile kaydet · Esc ile vazgeç</p>
            {actionError && (
              <div className="error-pane" role="alert">
                {actionError}
              </div>
            )}
          </div>
          <footer className="chat-modal-footer">
            <button className="button secondary" disabled={actionBusy} onClick={closeEdit}>
              Vazgeç
            </button>
            <button
              className="button primary"
              disabled={actionBusy || !edit.trim()}
              onClick={() => void saveEdit()}
            >
              Değişiklikleri kaydet
            </button>
          </footer>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Mesajı sil?"
          className="chat-message-modal chat-delete-modal"
          onClose={closeDelete}
        >
          <div className="chat-modal-body">
            <p>Bu mesaj kanaldaki herkes için silinecek. Bu işlem geri alınamaz.</p>
            {c.messages.find((m) => m.id === deleting) && (
              <div className="chat-delete-preview">
                <VoiceAvatar id={c.user!.id} name={c.user!.displayName} />
                <div>
                  <strong>{c.user!.displayName}</strong>
                  <p>{c.messages.find((m) => m.id === deleting)?.content}</p>
                </div>
              </div>
            )}
            {actionError && (
              <div className="error-pane" role="alert">
                {actionError}
              </div>
            )}
          </div>
          <footer className="chat-modal-footer">
            <button className="button secondary" disabled={actionBusy} onClick={closeDelete}>
              Vazgeç
            </button>
            <button
              className="button danger"
              disabled={actionBusy}
              onClick={() => {
                setActionBusy(true);
                setActionError('');
                void c
                  .deleteMessage(deleting)
                  .then(closeDelete)
                  .catch((error) => setActionError(uiError(error)))
                  .finally(() => setActionBusy(false));
              }}
            >
              Mesajı sil
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
export function CommunitySpaces({ notify }: { notify(message: string): void }) {
  const c = useCommunity();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => setShow(false), []);
  return (
    <div className="spaces-page page-enter">
      <div className="page-intro">
        <h2>Topluluklar</h2>
        <button className="button secondary" onClick={() => setShow(true)}>
          <Link size={16} />
          {tr('Join with an invite')}
        </button>
      </div>
      {c.spaces.length ? (
        <div className="spaces-grid">
          {c.spaces.map((s) => (
            <button
              key={s.id}
              className="space-card real-space-card"
              onClick={() => {
                void c.openSpace(s.id);
                navigate('/chat');
              }}
            >
              <div className="space-card-art">
                <span className="space-monogram">
                  {s.name.slice(0, 1)}
                  <span>.</span>
                </span>
              </div>
              <div className="space-card-copy">
                <h3>
                  {s.name}
                  <ArrowRight size={17} />
                </h3>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Users size={32} />} title={'Topluluk yok'}>
          {''}
        </EmptyState>
      )}
      {show && (
        <Modal title={'Davetle kat\u0131l'} onClose={close}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              void c
                .acceptInvite(code.trim())
                .then(() => {
                  setCode('');
                  close();
                })
                .catch((e) => notify(uiError(e)))
                .finally(() => setBusy(false));
            }}
          >
            <label className="field-label">
              {tr('INVITATION CODE')}
              <input
                aria-label={tr('Join invitation code')}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={128}
              />
            </label>
            <button type="submit" className="button primary full" disabled={!code.trim() || busy}>
              {busy ? tr('Joining\u2026') : tr('Join private space')}
              <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
export function CommunityVoice({
  openLauncher,
  notify,
}: {
  openLauncher(): void;
  notify(message: string): void;
}) {
  const c = useCommunity(),
    r = useRealtime(),
    navigate = useNavigate(),
    location = useLocation();
  const pushToTalk = useRooms((s) => s.preferences.pushToTalk);
  const fixtureParams = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
  const familiarRoom = true;
  const emptyFixture =
    fixtureParams?.get('fixture')?.toUpperCase() === 'S19' &&
    fixtureParams.get('variant') === 'empty';
  const focusFixture =
    fixtureParams?.get('fixture')?.toUpperCase() === 'S20' &&
    fixtureParams.get('variant') === 'focus';
  const shareFixtureVariant =
    fixtureParams?.get('fixture')?.toUpperCase() === 'S22' ? fixtureParams.get('variant') : null;
  const fixtureRoom = emptyFixture
    ? c.channels.find((channel) => channel.type === 2 && channel.name === 'Salon')
    : undefined;
  const selectedRoom = c.channels.find((ch) => ch.id === c.activeChannelId && ch.type === 2);
  const roomName =
    r.roomName ?? selectedRoom?.name ?? (emptyFixture ? (fixtureRoom?.name ?? 'Ses odası') : null);
  const [member, setMember] = useState<string | null>(null),
    [inviting, setInviting] = useState(false),
    [layout, setLayout] = useState<'gallery' | 'focus'>(() => (focusFixture ? 'focus' : 'gallery')),
    [focus, setFocus] = useState<string | null>(null);
  const close = useCallback(() => setMember(null), []),
    closeInvite = useCallback(() => setInviting(false), []);
  const person = r.participants.find((p) => p.id === member);
  const cameras = r.tracks.filter((t) => t.source === 'camera' && t.kind === 'video' && !t.muted);
  const screens = r.tracks.filter(
    (t) => t.source === 'screen_share' && t.kind === 'video' && !t.muted,
  );
  const hadScreen = useRef(shareFixtureVariant === 'source_closed');
  useEffect(() => {
    hadScreen.current = shareFixtureVariant === 'source_closed';
  }, [r.channelId, shareFixtureVariant]);
  useEffect(() => {
    if (screens.length) hadScreen.current = true;
  }, [screens.length]);
  const view = new URLSearchParams(location.search).get('view');
  const video = view === 'video' || (view !== 'share' && cameras.length > 0),
    share = view === 'share';
  const connected = r.status === 'connected';
  const focused =
    r.participants.find((p) => p.id === focus) ??
    r.participants.find((p) => p.speaking && !p.muted) ??
    r.participants[0];
  const channels = c.channels.filter((ch) => ch.type === 2);
  const shownParticipants = focusFixture
    ? r.participants.filter((p) => p.id !== 'demo-mert')
    : r.participants;
  const chooseSource = () => window.dispatchEvent(new Event('rooms:choose-capture'));
  const tile = (p: (typeof r.participants)[number]) => {
    const camera = cameras.find((t) => t.participantId === p.id),
      speaking = connected && p.speaking && !p.muted;
    return (
      <button
        key={p.id}
        data-voice-participant-id={p.id}
        className={`reference-participant ${video ? 'video-tile' : ''} ${speaking ? 'speaking' : ''} ${camera ? 'with-camera' : ''} ${layout === 'focus' && focused?.id === p.id ? 'focused' : ''}`}
        onClick={() => (video && layout === 'focus' ? setFocus(p.id) : setMember(p.id))}
        aria-label={`${p.name}${speaking ? ', konuşuyor' : ''}${p.muted ? ', mikrofon kapalı' : ''}`}
      >
        {camera ? (
          <MediaStage id={camera.id} label={`${p.name} kamerası`} className="voice-camera" />
        ) : (
          <span className="reference-participant-avatar">
            <VoiceAvatar id={p.id} name={p.name} large />
          </span>
        )}
        <span className="reference-participant-status">
          {p.screen && <MonitorUp size={15} aria-label="Ekran paylaşıyor" />}
          {video ? (
            <ReferenceIcon name={camera ? 'video' : 'video-off'} size={15} />
          ) : speaking ? (
            <span className="reference-audio-bars">
              <i />
              <i />
              <i />
              <i />
            </span>
          ) : (
            <ReferenceIcon name={p.muted ? 'mic-off' : 'mic'} size={15} />
          )}
        </span>
        <span className="reference-participant-name">
          {video &&
            (speaking ? (
              <span className="reference-audio-bars">
                <i />
                <i />
                <i />
                <i />
              </span>
            ) : (
              <ReferenceIcon name={p.muted ? 'mic-off' : 'mic'} size={13} />
            ))}
          <span title={p.name}>
            {p.name}
            {p.local ? ' (sen)' : ''}
          </span>
          {video && !camera && <small>kamera kapalı</small>}
        </span>
      </button>
    );
  };
  return (
    <div
      className={`discord-voice-page reference-voice-page page-enter ${familiarRoom ? 'familiar-room' : ''} ${video ? 'is-video' : ''} ${share ? 'is-screen' : ''}`}
    >
      <header className="reference-voice-heading">
        <div>
          <span className="reference-voice-eyebrow">
            {share ? 'EKRAN PAYLAŞIMI' : video ? 'GÖRÜNTÜLÜ ODA' : 'SES ODASI'}
          </span>
          <h2 title={roomName ?? undefined}>{roomName ?? 'Ses odaları'}</h2>
          <p>
            {emptyFixture
              ? 'Şimdilik sessiz. İlk sen gel.'
              : r.busy
                ? 'Bağlanıyor…'
                : connected
                  ? video
                    ? `${shownParticipants.length} kamera kutusu · ${r.participants.length} kişi sesli sohbette`
                    : `${r.participants.length} kişi odada`
                  : r.status === 'reconnecting'
                    ? 'Yeniden bağlanıyor…'
                    : r.channelId
                      ? 'Bağlantı kesildi'
                      : 'Bir ses odası seç.'}
          </p>
        </div>
        <div className="reference-voice-header-actions">
          {video && (
            <div className="segmented" aria-label="Kamera düzeni">
              <button
                aria-pressed={layout === 'gallery'}
                className={layout === 'gallery' ? 'selected' : ''}
                onClick={() => setLayout('gallery')}
              >
                <ReferenceIcon name="grid" size={15} />
                Galeri
              </button>
              <button
                aria-pressed={layout === 'focus'}
                className={layout === 'focus' ? 'selected' : ''}
                onClick={() => setLayout('focus')}
              >
                <ReferenceIcon name="maximize" size={15} />
                Odak
              </button>
            </div>
          )}
          {share && r.sharing && (
            <button
              className="button secondary"
              disabled={!connected}
              onClick={() => report(stopScreen().then(chooseSource), notify)}
            >
              <ReferenceIcon name="monitor" size={16} />
              Kaynağı değiştir
            </button>
          )}
          {!share && !video && (
            <button className="button secondary" onClick={() => setInviting(true)}>
              <ReferenceIcon name="plus" size={16} />
              Arkadaş davet et
            </button>
          )}
        </div>
      </header>
      {r.channelId && !connected && (
        <div className="reference-media-notice" role="status">
          <ReferenceIcon name="alert-triangle" size={18} />
          <span>
            {r.busy
              ? 'Odaya bağlanılıyor.'
              : r.status === 'reconnecting'
                ? 'Ses bağlantısı yeniden kuruluyor.'
                : 'Ses bağlantısı kesildi.'}
          </span>
          <button
            className="button secondary small"
            disabled={r.busy}
            onClick={() => report(joinVoice(r.channelId!, r.roomName ?? 'Ses'), notify)}
          >
            Yeniden bağlan
          </button>
        </div>
      )}
      {share && shareFixtureVariant === 'handover' && (
        <div className="reference-share-handover-banner" role="status">
          <ReferenceIcon name="alert-triangle" size={17} />
          <span>Deniz’in paylaşımı durdu. Ece’nin seçimi bekleniyor.</span>
        </div>
      )}
      {share && shareFixtureVariant === 'source_closed' && (
        <div className="reference-media-notice" role="status">
          <ReferenceIcon name="alert-triangle" size={18} />
          <span>Kaynak kapanması oturum devriyle çözülemez; yeni bir ekran kaynağı gerekiyor.</span>
        </div>
      )}
      {!r.channelId || emptyFixture ? (
        emptyFixture ? (
          <div className="reference-voice-empty-stage">
            <div>
              <ReferenceIcon name="headphones" size={42} />
              <h3>Oda sana hazır</h3>
              <p>
                Katıldığında arkadaşların seni burada görebilir. Mikrofonunu açmak tamamen sana
                bağlı.
              </p>
              <button
                className="button primary"
                disabled={!fixtureRoom || r.busy}
                onClick={() =>
                  fixtureRoom && report(joinVoice(fixtureRoom.id, fixtureRoom.name), notify)
                }
              >
                <ReferenceIcon name="headphones" size={17} />
                Salona katıl
              </button>
            </div>
          </div>
        ) : (
          <div className="reference-voice-empty">
            <ReferenceIcon name="headphones" size={38} />
            <h3>Ses odaları</h3>
            {channels.length ? (
              <div className="voice-join-list">
                {(selectedRoom ? [selectedRoom] : channels).map((ch) => (
                  <button
                    className="button secondary"
                    disabled={r.busy}
                    key={ch.id}
                    onClick={() => report(joinVoice(ch.id, ch.name), notify)}
                  >
                    <ReferenceIcon name="volume" size={18} />
                    {ch.name}
                    <span>Katıl</span>
                  </button>
                ))}
              </div>
            ) : (
              <p>Ses odası yok.</p>
            )}
          </div>
        )
      ) : share ? (
        <div className="reference-share-content">
          {screens.length > 0 ? (
            <>
              <div className="reference-share-banner">
                <ReferenceIcon name="monitor" size={17} />
                <span>{r.sharing ? 'Ekran paylaşımın açık' : 'Ekran paylaşımını izliyorsun'}</span>
                {!r.sharing && <span className="reference-watching-pill">İzliyorsun</span>}
                {r.sharing && (
                  <button
                    className="button danger small"
                    onClick={() => report(stopScreen(), notify)}
                  >
                    Paylaşımı durdur
                  </button>
                )}
              </div>
              <ScreenShareGallery
                onWatch={watchScreen}
                onVolume={setScreenVolume}
                onClose={() => {
                  watchScreen(null);
                  navigate('/voice');
                }}
                initialTrackId={new URLSearchParams(location.search).get('screen') ?? undefined}
                tracks={screens}
                people={r.participants}
                renderTrack={(id, label) => <MediaStage key={id} id={id} label={label} />}
                notify={notify}
              />
            </>
          ) : (
            <div className="reference-voice-empty">
              <ReferenceIcon name="monitor" size={40} />
              {shareFixtureVariant === 'handover' ? (
                <>
                  <h3>Yeni paylaşım bekleniyor</h3>
                  <p>
                    Sunma hakkı Ece’ye geçti. Ece kendi cihazından bir kaynak seçip paylaşımı
                    başlatmalı.
                  </p>
                  <button className="button primary" onClick={() => navigate('/voice')}>
                    <ReferenceIcon name="headphones" size={17} />
                    Salona dön
                  </button>
                </>
              ) : (
                <>
                  <h3>
                    {hadScreen.current ? 'Paylaşılan pencere kapandı' : 'Ekran paylaşımı yok'}
                  </h3>
                  <p>
                    {shareFixtureVariant === 'source_closed'
                      ? 'Paylaşılan ekran artık kullanılamıyor. Oturumu Ece düzenliyor; oynatmak için yeni bir kaynak gerekiyor.'
                      : 'Yeni paylaşım için bu cihazdan bir kaynak seç.'}
                  </p>
                  <button className="button primary" disabled={!connected} onClick={chooseSource}>
                    <ReferenceIcon name="monitor" size={17} />
                    {shareFixtureVariant === 'source_closed' ? 'Yeni kaynak paylaş' : 'Kaynak seç'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className={`reference-voice-grid-wrap ${video ? 'video' : ''}`}>
          <div
            className={`reference-participant-grid ${video ? 'video-grid' : ''} ${video && layout === 'focus' ? 'focus-grid' : ''} ${r.participants.length <= 2 ? 'small-room' : ''}`}
            style={
              familiarRoom
                ? ({
                    '--room-columns': shownParticipants.length <= 4 ? 2 : 3,
                    '--room-rows': Math.ceil(
                      (shownParticipants.length +
                        screens.length +
                        (shownParticipants.length === 1 ? 1 : 0)) /
                        (shownParticipants.length <= 4 ? 2 : 3),
                    ),
                  } as React.CSSProperties)
                : undefined
            }
          >
            {shownParticipants.map(tile)}
            {screens.map((track) => (
              <button
                className="room-share-preview"
                key={track.id}
                aria-label={`${r.participants.find((p) => p.id === track.participantId)?.name ?? 'Katılımcı'} ekranını izle`}
                onClick={() => navigate(`/voice?view=share&screen=${encodeURIComponent(track.id)}`)}
              >
                <MediaStage id={track.id} label="Ekran paylaşımı önizlemesi" />
                <span>
                  <MonitorUp size={14} />
                  {r.participants.find((p) => p.id === track.participantId)?.name ?? 'Katılımcı'}
                  {track.local ? ' (sen)' : ''}
                </span>
              </button>
            ))}
            {familiarRoom && shownParticipants.length === 1 ? (
              <div className="room-activity-tile">
                <div className="room-activity-illustration" aria-hidden="true">
                  <Gem size={90} />
                  <Trophy size={110} />
                  <Dice5 size={70} />
                </div>
                <div>
                  <button className="button secondary" onClick={() => setInviting(true)}>
                    <ReferenceIcon name="user-plus" size={18} />
                    Arkadaş davet et
                  </button>
                  <button className="button secondary" onClick={openLauncher}>
                    <ReferenceIcon name="plus" size={18} />
                    Etkinlik seç
                  </button>
                </div>
              </div>
            ) : (
              !video &&
              !familiarRoom && (
                <button
                  className="reference-participant invite-tile"
                  onClick={() => setInviting(true)}
                >
                  <span>
                    <ReferenceIcon name="plus" size={24} />
                  </span>
                  <strong>Arkadaş davet et</strong>
                </button>
              )
            )}
            {!r.participants.length && (
              <p className="muted">{r.busy ? 'Bağlanıyor…' : 'Katılımcı yok.'}</p>
            )}
          </div>
        </div>
      )}
      {!share && screens.length > 0 && (
        <button className="room-watch-share" onClick={() => navigate('/voice?view=share')}>
          <MonitorUp size={16} />
          Ekran paylaşımını izle
        </button>
      )}

      {pushToTalk && !video && !share && r.channelId && (
        <div className="reference-media-notice reference-ptt-notice">
          <ReferenceIcon name="mic" size={17} />
          <span>Bas konuş açık · Ctrl + Shift + Space</span>
        </div>
      )}
      {r.channelId && !video && !share && (
        <div className="reference-voice-meta">
          <span>
            <ReferenceIcon name="headphones" size={13} />
            {connected ? `${r.roomName} odasına bağlısın` : 'Bağlantı bekleniyor'}
          </span>
          <button onClick={() => navigate('/settings?tab=audio')}>
            <ReferenceIcon name="settings" size={13} />
            Ses ayarları
          </button>
          <button onClick={openLauncher}>
            <ReferenceIcon name="plus" size={13} />
            Etkinlikler
          </button>
        </div>
      )}
      {r.error && (
        <div className="reference-media-notice" role="alert">
          <ReferenceIcon name="alert-triangle" size={18} />
          <span>{r.error}</span>
          <button
            className="button secondary small"
            onClick={() => navigate('/settings?tab=audio')}
          >
            Cihaz ayarları
          </button>
        </div>
      )}
      <VoiceRoomViewActions notify={notify} />
      {person && (
        <Modal title={person.name} onClose={close}>
          <div className="voice-member-profile">
            <VoiceAvatar id={person.id} name={person.name} large />
            <span>
              {person.muted
                ? 'Mikrofon kapalı'
                : connected && person.speaking
                  ? 'Konuşuyor'
                  : 'Dinliyor'}
            </span>
          </div>
          {!person.local && (
            <>
              <label className="field-label">
                KİŞİSEL SES · {Math.round(person.volume * 100)}%
                <input
                  type="range"
                  aria-label="Katılımcı sesi"
                  min={0}
                  max={1}
                  step={0.01}
                  value={person.volume}
                  onChange={(e) => setParticipantVolume(person.id, Number(e.target.value))}
                />
              </label>
              {!person.id.startsWith('rooms-music-') && (
                <button
                  className="button secondary"
                  onClick={() =>
                    report(
                      c.createDM(person.id).then(() => {
                        close();
                        navigate('/chat');
                      }),
                      notify,
                    )
                  }
                >
                  <MessageCircle size={16} />
                  Mesaj gönder
                </button>
              )}
            </>
          )}
          {person.local && (
            <button
              className="button secondary"
              onClick={() => {
                close();
                navigate('/settings?tab=audio');
              }}
            >
              Ses ayarları
            </button>
          )}
        </Modal>
      )}
      {inviting && <CommunityInvite onClose={closeInvite} notify={notify} />}
      {shareFixtureVariant === 'request' && (
        <Modal
          title="Ece ekranını paylaşmak istiyor"
          onClose={() => navigate('/voice?view=share')}
          className="reference-share-intent-modal"
        >
          <div className="reference-share-intent-person">
            <VoiceAvatar id="demo-ece" name="Ece" large />
            <div>
              <strong>Ece</strong>
              <p>“Şu pencereyi gösterebilir miyim?”</p>
            </div>
          </div>
          <div className="reference-share-intent-callout">
            <ReferenceIcon name="monitor" size={17} />
            <span>
              Kabul edersen mevcut paylaşımın durur. Ece kendi ekranını seçip başlatana kadar oda
              yeni kaynak bekler.
            </span>
          </div>
          <p className="reference-share-intent-note">
            Salon’daki sesli sohbet devam eder. Talebi reddetmek Ece’yi odadan çıkarmaz.
          </p>
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() =>
                report(decideScreenHandoff('20000000-0000-4000-8000-000000000022', false), notify)
              }
            >
              Şimdilik reddet
            </button>
            <button
              className="button primary"
              onClick={() =>
                report(decideScreenHandoff('20000000-0000-4000-8000-000000000022', true), notify)
              }
            >
              <ReferenceIcon name="arrow-right" size={16} />
              Paylaşımı devret
            </button>
          </div>
        </Modal>
      )}
      {shareFixtureVariant === 'request_sent' && (
        <Modal
          title="Paylaşım talebin Ece’ye iletildi"
          onClose={() => navigate('/voice?view=share')}
          className="reference-share-intent-modal"
        >
          <div className="reference-share-intent-person">
            <VoiceAvatar id="demo-ece" name="Ece" large />
            <div>
              <strong>Ece ekranını paylaşıyor</strong>
              <p>Onay verdiğinde kendi kaynağını seçebilirsin.</p>
            </div>
          </div>
          <div className="reference-share-intent-callout">
            <ReferenceIcon name="monitor" size={17} />
            <span>
              Ece’nin paylaşımı onay verilene kadar devam eder. Kaynak ve ekran kaydı otomatik
              olarak senin bilgisayarına taşınmaz.
            </span>
          </div>
          <p className="reference-share-intent-note">Bu sırada odadaki sesli sohbet devam eder.</p>
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() => report(cancelScreenHandoff(), notify)}
            >
              Talebi iptal et
            </button>
            <button className="button primary" onClick={() => navigate('/voice?view=share')}>
              Paylaşımı izlemeye dön
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
export function RealVoiceDock({
  openLauncher,
  notify,
  showControls = true,
}: {
  openLauncher(): void;
  notify(message: string): void;
  showControls?: boolean;
}) {
  const r = useRealtime(),
    location = useLocation(),
    navigate = useNavigate();
  const identity = useCommunity((state) => state.user?.id ?? null);
  const familiarRoom = true;
  const videoMode =
    new URLSearchParams(location.search).get('view') === 'video' ||
    r.camera ||
    r.participants.some((person) => person.camera);
  const [shareQuality, setShareQuality] =
      useState<import('@rooms/media').ScreenShareQuality>('1080p60'),
    [shareAudio, setShareAudio] = useState(false);
  const [picker, setPicker] = useState(false),
    [sources, setSources] = useState<{ id: string; name: string; thumbnail: string }[]>([]),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [sourceType, setSourceType] = useState<'window' | 'screen'>('window'),
    [more, setMore] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<{
    screen: string;
    systemAudio: boolean;
  } | null>(null);
  const generation = useRef(0);
  const close = useCallback(() => {
    generation.current++;
    setPicker(false);
    setSelected('');
    setError('');
    setBusy(false);
  }, []);
  const choose = useCallback(async () => {
    const epoch = ++generation.current;
    setPicker(true);
    setBusy(true);
    setError('');
    setSelected('');
    setSources([]);
    setCaptureStatus(null);
    try {
      const bridge = mediaBridge();
      const [items, status] = await Promise.allSettled([
        bridge.captureSources(),
        bridge.captureStatus(),
      ]);
      if (generation.current === epoch) {
        if (status.status === 'fulfilled') setCaptureStatus(status.value);
        if (items.status === 'rejected') throw items.reason;
        setSources(items.value);
        setSourceType(items.value.some((s) => s.id.startsWith('window:')) ? 'window' : 'screen');
      }
    } catch (e) {
      if (generation.current === epoch) setError(uiError(e));
    } finally {
      if (generation.current === epoch) setBusy(false);
    }
  }, []);
  useEffect(() => {
    const listener = () => {
      if (isConnected()) void choose();
    };
    window.addEventListener('rooms:choose-capture', listener);
    return () => window.removeEventListener('rooms:choose-capture', listener);
  }, [choose, r.status, r.channelId]);
  useEffect(() => {
    close();
  }, [r.channelId, identity, close]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (
      location.pathname === '/voice' &&
      params.get('choose') === '1' &&
      r.status === 'connected'
    ) {
      void choose();
      params.delete('choose');
      navigate(`/voice?${params}`, { replace: true });
    }
  }, [location.pathname, location.search, r.status, choose, navigate]);
  function isConnected() {
    return r.status === 'connected' && Boolean(r.channelId);
  }
  if (!r.channelId) return null;
  const connected = r.status === 'connected',
    visibleSources = sources.filter((s) => s.id.startsWith(`${sourceType}:`));
  return (
    <>
      {showControls && (
        <div
          className={`voice-dock real-voice-dock reference-voice-dock glass ${r.sharing ? 'is-sharing' : ''} ${familiarRoom ? 'familiar-room-dock' : ''}`}
        >
          <button className="dock-context" onClick={() => navigate('/voice')}>
            <ReferenceIcon name="headphones" size={18} />
            <div>
              <strong>{r.roomName}</strong>
              <small>
                {r.busy
                  ? 'Bağlanıyor…'
                  : connected
                    ? `${r.participants.length} kişi odada`
                    : r.status === 'reconnecting'
                      ? 'Yeniden bağlanıyor…'
                      : 'Bağlantı kesildi'}
              </small>
            </div>
          </button>
          <div className="dock-divider" />
          <div className="room-dock-group room-device-controls">
            <IconButton
              disabled={!connected}
              label={r.muted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
              className={r.muted ? 'muted-control' : ''}
              onClick={() => report(toggleMic(), notify)}
            >
              <ReferenceIcon name={r.muted ? 'mic-off' : 'mic'} size={19} />
            </IconButton>
            <QuietMenu label="Mikrofon ayarları" compact arrow>
              <button onClick={() => navigate('/settings?tab=audio')}>
                Ses giriş ve çıkış cihazları
              </button>
              <button disabled={!connected} onClick={() => report(toggleDeafen(), notify)}>
                {r.deafened ? 'Sağırlaştırmayı kapat' : 'Sağırlaştır'}
              </button>
            </QuietMenu>
            {!videoMode && !familiarRoom && (
              <IconButton
                disabled={!connected}
                label={r.deafened ? 'Oda sesini aç' : 'Oda sesini kapat'}
                className={r.deafened ? 'muted-control' : ''}
                onClick={() => report(toggleDeafen(), notify)}
              >
                <ReferenceIcon name={r.deafened ? 'headphones-off' : 'headphones'} size={19} />
              </IconButton>
            )}
            <IconButton
              disabled={!connected}
              label={r.camera ? 'Kamerayı kapat' : 'Kamerayı aç'}
              className={r.camera ? 'camera-on' : 'camera-off'}
              onClick={() =>
                report(
                  toggleCamera().then(() => {
                    if (!r.camera) navigate('/voice?view=video');
                  }),
                  notify,
                )
              }
            >
              <ReferenceIcon name={r.camera ? 'video' : 'video-off'} size={19} />
            </IconButton>
            <QuietMenu label="Kamera ayarları" compact arrow>
              <button onClick={() => navigate('/settings?tab=audio')}>
                Kamera ve video ayarları
              </button>
            </QuietMenu>
          </div>
          <div className="room-dock-group room-activity-controls">
            {r.sharing ? (
              <button className="stop-sharing" onClick={() => report(stopScreen(), notify)}>
                <ReferenceIcon name="x" size={15} />
                Paylaşımı durdur
              </button>
            ) : (
              <IconButton label="Ekran paylaş" disabled={!connected} onClick={() => void choose()}>
                <ReferenceIcon name="monitor" size={19} />
              </IconButton>
            )}
            <div className="dock-divider" />
            <button
              className="button primary reference-start-activity"
              aria-label="Etkinlik başlat"
              title="Etkinlik başlat"
              onClick={openLauncher}
            >
              <ReferenceIcon name="plus" size={18} />
              <span>{familiarRoom ? 'Etkinlikler' : 'Etkinlik başlat'}</span>
            </button>
            <IconButton
              label="Soundboard"
              onClick={() => window.dispatchEvent(new Event('rooms:open-soundboard'))}
            >
              <AudioLines size={19} />
            </IconButton>
            <div className="reference-dock-more">
              <IconButton label="Daha fazla ses kontrolü" onClick={() => setMore(!more)}>
                <ReferenceIcon name="more" size={18} />
              </IconButton>
              {more && (
                <div className="reference-dock-menu">
                  <button
                    disabled={!connected}
                    onClick={() => {
                      setMore(false);
                      report(toggleDeafen(), notify);
                    }}
                  >
                    <ReferenceIcon name={r.deafened ? 'headphones-off' : 'headphones'} size={16} />
                    {r.deafened ? 'Oda sesini aç' : 'Oda sesini kapat'}
                  </button>
                  <button
                    onClick={() => {
                      setMore(false);
                      navigate('/settings?tab=audio');
                    }}
                  >
                    <ReferenceIcon name="settings" size={16} />
                    Cihaz ayarları
                  </button>
                </div>
              )}
            </div>
          </div>
          <IconButton
            label="Odadan ayrıl"
            className="leave-control"
            onClick={() => report(leaveVoice(), notify)}
          >
            <ReferenceIcon name="phone-off" size={19} />
          </IconButton>
          {r.audioBlocked && (
            <button
              className="button small secondary"
              onClick={() => report(startRoomAudio(), notify)}
            >
              Sesi aç
            </button>
          )}
        </div>
      )}
      {r.error && (
        <div className="voice-error-notice" role="alert">
          <span>{r.error}</span>
          <button onClick={() => navigate('/voice')}>Odayı aç</button>
        </div>
      )}
      {picker && (
        <Modal
          title="Ne paylaşmak istersin?"
          onClose={close}
          className="capture-modal reference-capture-modal"
        >
          <p className="modal-description">Paylaşacağın pencereyi veya ekranı seç.</p>
          <div className="segmented reference-source-tabs" aria-label="Kaynak türü">
            {(['window', 'screen'] as const).map((kind) => (
              <button
                key={kind}
                aria-pressed={sourceType === kind}
                className={sourceType === kind ? 'selected' : ''}
                onClick={() => {
                  setSourceType(kind);
                  setSelected('');
                }}
              >
                <ReferenceIcon name={kind === 'screen' ? 'monitor' : 'square'} size={16} />
                {kind === 'window' ? 'Pencere' : 'Tüm ekran'}
              </button>
            ))}
          </div>
          {busy ? (
            <div className="reference-capture-loading" role="status">
              Ekranlar ve pencereler aranıyor…
            </div>
          ) : (
            <div className="capture-grid reference-capture-grid">
              {visibleSources.map((s) => (
                <button
                  key={s.id}
                  className={selected === s.id ? 'selected' : ''}
                  aria-pressed={selected === s.id}
                  onClick={() => setSelected(s.id)}
                >
                  {s.thumbnail ? (
                    <img src={s.thumbnail} alt={`${s.name} önizlemesi`} />
                  ) : (
                    <div className="reference-source-no-preview">
                      <ReferenceIcon name="monitor" size={30} />
                    </div>
                  )}
                  <span>
                    {s.name}
                    {selected === s.id && <ReferenceIcon name="check" size={15} />}
                  </span>
                  <small>
                    {sourceType === 'window'
                      ? 'Yalnızca bu pencere'
                      : 'Tüm ekran · bildirimler görünebilir'}
                  </small>
                </button>
              ))}
            </div>
          )}
          {!visibleSources.length && !busy && !error && (
            <p className="modal-description">
              {captureStatus?.screen === 'denied'
                ? 'macOS ekran kaydı izni kapalı. Sistem Ayarları → Gizlilik ve Güvenlik → Ekran ve Sistem Sesi Kaydı bölümünden ROOMS’a izin ver.'
                : 'Bu türde paylaşılabilir kaynak bulunamadı.'}
            </p>
          )}
          {error && (
            <div className="reference-media-notice" role="alert">
              <ReferenceIcon name="alert-triangle" size={18} />
              <span>{error}</span>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => void choose()}
              >
                Yeniden dene
              </button>
            </div>
          )}
          <div className="reference-capture-privacy">
            <ReferenceIcon name="lock" size={17} />
            <span>Yalnızca seçtiğin kaynak paylaşılır. Paylaşım, onay verdiğinde başlar.</span>
          </div>
          <label className="field-label">
            Paylaşım kalitesi
            <select
              value={shareQuality}
              onChange={(e) =>
                setShareQuality(e.target.value as import('@rooms/media').ScreenShareQuality)
              }
            >
              {(['720p30', '1080p30', '1080p60', '1440p60', '4k30'] as const).map((quality) => (
                <option key={quality} value={quality}>
                  {quality}
                </option>
              ))}
            </select>
          </label>
          <div className="reference-capture-audio">
            <button
              className={`toggle ${shareAudio ? 'on' : ''}`}
              role="switch"
              aria-label="Sistem sesini paylaş"
              aria-checked={shareAudio}
              disabled={!captureStatus?.systemAudio}
              onClick={() => setShareAudio(!shareAudio)}
            >
              <span />
            </button>
            <div>
              <strong>Sistem sesini paylaş</strong>
              <small>
                {captureStatus?.systemAudio
                  ? 'Bilgisayar sesi de odaya gönderilir.'
                  : 'Sistem sesi için desteklenen işletim sistemi gerekli.'}
              </small>
            </div>
          </div>
          <div className="button-row">
            <button className="button secondary" disabled={busy} onClick={close}>
              Vazgeç
            </button>
            <button
              className="button primary"
              disabled={!selected || busy || !connected}
              onClick={() => {
                const epoch = generation.current;
                setBusy(true);
                void startScreen(selected, {
                  quality: shareQuality,
                  audio: shareAudio,
                  content: 'motion',
                })
                  .then(() => {
                    navigate('/voice?view=share');
                    if (generation.current === epoch) close();
                  })
                  .catch((e) => {
                    if (generation.current === epoch) setError(uiError(e));
                  })
                  .finally(() => {
                    if (generation.current === epoch) setBusy(false);
                  });
              }}
            >
              <ReferenceIcon name="monitor" size={16} />
              {busy ? 'Başlatılıyor…' : 'Seçili kaynağı paylaş'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function CommunityInvite({
  onClose,
  notify,
}: {
  onClose(): void;
  notify(message: string): void;
}) {
  const c = useCommunity();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const channel =
    c.channels.find((ch) => ch.id === c.activeChannelId && ch.type === 0)?.id ??
    c.channels.find((ch) => ch.type === 0)?.id;
  return (
    <Modal title={'Davet olu\u015Ftur'} onClose={onClose}>
      <p className="modal-description">
        {tr('Bu davetle arkadaşın kendi hesabını açabilir. Tek kullanımlık, 24 saat geçerli.')}
      </p>
      {code ? (
        <>
          <label className="field-label">
            {tr('INVITATION CODE')}
            <input aria-label={tr('Created invitation code')} readOnly value={code} />
          </label>
          <button
            className="button primary full"
            onClick={() => {
              void navigator.clipboard
                .writeText(code)
                .then(() => notify(tr('Invitation code copied.')))
                .catch(() =>
                  setError(tr('Clipboard is unavailable. Select and copy the code above.')),
                );
            }}
          >
            <Copy size={16} />
            {tr('Copy invitation code')}
          </button>
          <button
            className="button secondary full"
            onClick={() => {
              const link = `rooms://invite?server=${encodeURIComponent(c.serverUrl)}&code=${encodeURIComponent(code)}`;
              void navigator.clipboard
                .writeText(link)
                .then(() => notify(tr('Davet ba\u011Flant\u0131s\u0131 kopyaland\u0131.')))
                .catch(() => setError(tr('Panoya eri\u015Filemiyor. Davet kodunu kopyala.')));
            }}
          >
            <Link size={16} />
            {tr('Davet ba\u011Flant\u0131s\u0131n\u0131 kopyala')}
          </button>
        </>
      ) : (
        <button
          className="button primary full"
          disabled={!channel || busy}
          onClick={() => {
            setBusy(true);
            setError('');
            void c
              .createInvite(channel!)
              .then((i) => setCode(i.code))
              .catch((e) => setError(uiError(e)))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? tr('Creating\u2026') : tr('Create invitation')}
          <ArrowRight size={15} />
        </button>
      )}
      {!channel && (
        <p className="modal-description">{tr('Open a space with a text channel first.')}</p>
      )}
      {error && (
        <div className="error-pane" role="alert">
          <p>{error}</p>
        </div>
      )}
    </Modal>
  );
}
