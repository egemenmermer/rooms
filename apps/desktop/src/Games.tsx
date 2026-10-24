import { Kiraathane, gameNames } from './Kiraathane';
import './reference-games.css';
import {
  validate101Meld,
  validate101Opening,
  validate101Pairs,
  type OkeyTile,
} from '../../../packages/games/src/okey101';
import { legalBatakCards } from '../../../packages/games/src/batak';
import type { Card as EngineCard, Suit } from '../../../packages/games/src/cards';
import { VoiceAvatar } from './VoiceAvatar';
import { InviteLinkCard } from './InviteLinkCard';
import type { SocialInvite } from '@rooms/social';
import { locale, t, tr, uiError } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  ChevronDown,
  Clock3,
  Coins,
  Eye,
  Headphones,
  X,
  UserPlus,
  SlidersHorizontal,
  Gamepad2,
  History,
  Plus,
  RefreshCw,
  ShieldCheck,
  Spade,
  Trophy,
  Users,
} from 'lucide-react';
import { Avatar, EmptyState, IconButton, Modal } from '@rooms/design';
import { useActivityRoom } from './activity';
import { retiredActivity } from './activity-route';
import { useCurrentRoom } from './Agent';
import { useCommunity } from './community';
import type {
  ActivityCommand,
  GamePublicState,
  HoldemTableRules,
} from '../../../packages/activity-protocol/src';
import { endsActivity } from '../../../packages/activity-protocol/src';
import type { GamesFixtureMetadata } from './dev/games-fixture';
type GameKind = GamePublicState['kind'];
type Card = {
  id: string;
  suit: string;
  rank: number;
};
type Tile = {
  id: string;
  color: string;
  value: number;
  joker?: boolean;
};
const names = gameNames;
/** Older servers titled tables with the raw game id ("blackjack"); show the real name instead. */
const tableTitle = (title: string | undefined, kind: GameKind | undefined) =>
  !title || (kind && (title === kind || title === `${kind}`))
    ? kind
      ? names[kind]
      : title
    : title;
const suits: Record<string, string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
// Spoken names: screen readers say "Kupa As", not "14 ♥".
const suitNames: Record<string, string> = {
  clubs: t('Sinek'),
  diamonds: t('Karo'),
  hearts: t('Kupa'),
  spades: t('Maça'),
};
const rankNames: Record<number, string> = {
  11: t('Vale'),
  12: t('Kız'),
  13: t('Papaz'),
  14: t('As'),
};
const tileColors: Record<string, string> = {
  red: t('Kırmızı'),
  black: t('Siyah'),
  blue: t('Mavi'),
  yellow: t('Sarı'),
};
const array = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
// Presentational total of already-delivered cards; game decisions remain server-owned.
function blackjackTotal(cards: Card[]) {
  let total = 0,
    aces = 0;
  for (const card of cards) {
    if (card.rank === 14) {
      total += 11;
      aces++;
    } else total += Math.min(card.rank, 10);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}
function PlayingCard({
  card,
  selected,
  winning,
  onClick,
  disabled,
}: {
  card?: Card;
  selected?: boolean;
  winning?: boolean;
  onClick?(): void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || !onClick}
      className={`playing-card ${!card ? 'back' : ''} ${card && ['hearts', 'diamonds'].includes(card.suit) ? 'red' : ''} ${selected ? 'selected' : ''} ${winning ? 'winning' : ''}`}
      aria-pressed={onClick ? !!selected : undefined}
      aria-label={
        card
          ? `${suitNames[card.suit] ?? card.suit} ${rankNames[card.rank] ?? card.rank}`
          : tr('Kapal\u0131 kart')
      }
      onClick={onClick}
    >
      {card ? (
        <>
          <span>
            {({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[card.rank] ??
              card.rank}
            <i>{suits[card.suit]}</i>
          </span>
          <b>{suits[card.suit]}</b>
        </>
      ) : (
        <span className="card-back-mark">{tr('r.')}</span>
      )}
    </button>
  );
}
export default function Games() {
  const roomId = useCurrentRoom(),
    activity = useActivityRoom(roomId);
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    community = useCommunity(),
    fixtureMetadata = useGameFixtureMetadata();
  const [create, setCreate] = useState<GameKind | null>(null),
    [variant, setVariant] = useState<'ihaleli' | 'esli' | 'koz-maca' | 'gommeli'>('ihaleli'),
    [folding, setFolding] = useState(false),
    [teams, setTeams] = useState(false);
  const game =
    activity.room?.primary?.activity === activity.room?.game?.kind
      ? (activity.room?.game ?? null)
      : null;
  useEffect(() => setCreate(null), [roomId, activity.room?.primary?.startedAt]);
  // The app directory opens a game's table setup directly: /games?create=holdem.
  const requested = params.get('create');
  useEffect(() => {
    if (requested && Object.hasOwn(names, requested)) setCreate(requested as GameKind);
  }, [requested]);
  useEffect(() => {
    if (fixtureMetadata) {
      setCreate(fixtureMetadata.ui.create);
      setVariant(fixtureMetadata.ui.variant);
      setFolding(fixtureMetadata.ui.folding);
      setTeams(fixtureMetadata.ui.teams);
    }
  }, [fixtureMetadata]);
  if (params.get('tab') === 'history')
    return <ReferenceGameHistory activity={activity} game={game} />;
  if (params.get('tab') !== 'table' && !create)
    return (
      <Kiraathane
        game={game}
        ready={activity.status === 'connected'}
        error={activity.error}
        busy={activity.busy}
        blocked={
          activity.room?.participants.find((p) => p.userId === community.user?.id)?.canCreate ===
          false
            ? t('Bu odada masa açma yetkin yok.')
            : ''
        }
        otherActivity={
          activity.room?.primary && !game
            ? retiredActivity(activity.room.primary.activity)
              ? t('eski Sinema oturumu')
              : activity.room.primary.activity === 'screen'
                ? t('ekran paylaşımı')
                : (tableTitle(activity.room.primary.title, undefined) ?? t('bir etkinlik'))
            : null
        }
        onCreate={setCreate}
        onOpen={() => navigate('/games?tab=table')}
        onHistory={() => navigate('/games?tab=history')}
        onRetry={() => void activity.refresh()}
      />
    );
  if (game && game.status !== 'waiting' && game.kind !== 'holdem')
    return (
      <>
        <button className="coffeehouse-return" onClick={() => navigate('/games')}>
          {t('← Kıraathaneye dön')}
        </button>
        <ReferenceOtherGame
          key={`${roomId}:${activity.room?.primary?.startedAt}`}
          activity={activity}
          game={game}
        />
      </>
    );
  return (
    <>
      <button
        className="coffeehouse-return"
        onClick={() => {
          setCreate(null);
          navigate('/games');
        }}
      >
        {t('← Kıraathaneye dön')}
      </button>
      <ReferenceGames
        activity={activity}
        roomId={roomId}
        game={game ?? null}
        onCreate={setCreate}
        create={create}
        variant={variant}
        setVariant={setVariant}
        folding={folding}
        setFolding={setFolding}
        teams={teams}
        setTeams={setTeams}
      />
    </>
  );
}
function ReferenceGames({
  activity,
  roomId,
  game,
  onCreate,
  create,
  variant,
  setVariant,
  folding,
  setFolding,
  teams,
  setTeams,
}: {
  activity: ReturnType<typeof useActivityRoom>;
  roomId: string | null;
  game: GamePublicState | null;
  onCreate(value: GameKind | null): void;
  create: GameKind | null;
  variant: 'ihaleli' | 'esli' | 'koz-maca' | 'gommeli';
  setVariant(value: 'ihaleli' | 'esli' | 'koz-maca' | 'gommeli'): void;
  folding: boolean;
  setFolding(value: boolean): void;
  teams: boolean;
  setTeams(value: boolean): void;
}) {
  const c = useCommunity(),
    navigate = useNavigate(),
    fixtureMetadata = useGameFixtureMetadata();
  const [holdemRules, setHoldemRules] = useState<HoldemTableRules>({
      name: 'Texas Hold’em',
      capacity: 6,
      smallBlind: 10,
      bigBlind: 20,
      minBuyIn: 200,
      maxBuyIn: 2000,
      initialChips: 1000,
      spectatorsAllowed: true,
    }),
    [entry, setEntry] = useState(1000),
    [configure, setConfigure] = useState(false);
  const [history, setHistory] = useState(false),
    [raise, setRaise] = useState(false),
    [amount, setAmount] = useState(20),
    [end, setEnd] = useState(false),
    [rules, setRules] = useState(false),
    [buyIn, setBuyIn] = useState<number | null>(null),
    [now, setNow] = useState(Date.now());
  const fixture = import.meta.env.DEV && new URLSearchParams(location.search).has('fixture');
  const fixtureReason = t('Yerel görsel örnekte gerçek oyun işlemi kapalı');
  useEffect(() => {
    activity.clearError();
  }, [create, activity.clearError]);
  const ready = activity.status === 'connected',
    view = game?.view ?? {},
    playing = game?.status === 'playing',
    waiting = game?.status === 'waiting';
  const own = game?.seats.find((seat) => seat.userId === c.user?.id),
    owner = game?.ownerId === c.user?.id;
  const access = !!own || view.watching === true;
  const projected = array<Record<string, unknown>>(view.seats),
    mine = projected.find((seat) => seat.userId === c.user?.id);
  const capacity = Math.min(
    9,
    Math.max(
      1,
      Number(
        view.rules?.capacity ??
          view.capacity ??
          (game?.kind === 'blackjack' ? 7 : game?.kind === 'holdem' ? 9 : 4),
      ),
    ),
  );
  const commandLock = useRef(false);
  const commandScope = `${c.serverUrl}:${roomId}:${c.user?.id}:${activity.room?.primary?.startedAt}`;
  const commandGeneration = useRef(commandScope);
  commandGeneration.current = commandScope;
  const [inviteOpen, setInviteOpen] = useState(false),
    [invite, setInvite] = useState<SocialInvite | null>(null),
    [inviteBusy, setInviteBusy] = useState(false),
    [inviteError, setInviteError] = useState('');
  const inviteRequest = useRef(0);
  const [replaceConsent, setReplaceConsent] =
    useState<Extract<ActivityCommand, { type: 'game.create' }>['replacePrimary']>();
  const currentPrimary = activity.room?.primary;
  const ownParticipant = activity.room?.participants.find((person) => person.userId === c.user?.id);
  const canReplace =
    ownParticipant?.canCreate === true &&
    ownParticipant.canControl &&
    endsActivity(currentPrimary ?? null, c.user?.id, true);
  const replacementMatches =
    !!replaceConsent &&
    !!currentPrimary &&
    replaceConsent.activity === currentPrimary.activity &&
    replaceConsent.startedAt === currentPrimary.startedAt;
  const createConflict = !!currentPrimary && !(canReplace && replacementMatches);
  const closeInvite = () => {
    inviteRequest.current++;
    setInviteOpen(false);
    setInviteBusy(false);
    setInvite(null);
    setInviteError('');
  };
  useEffect(() => {
    closeInvite();
    setReplaceConsent(undefined);
  }, [commandScope, create]);
  const generateInvite = async () => {
    if (fixture || !roomId || c.status !== 'connected' || inviteBusy) return;
    const request = ++inviteRequest.current,
      scope = commandGeneration.current;
    setInviteBusy(true);
    setInviteError('');
    try {
      const result = await c.createInvite(roomId);
      if (request === inviteRequest.current && scope === commandGeneration.current)
        setInvite(result);
    } catch (error) {
      if (request === inviteRequest.current && scope === commandGeneration.current)
        setInviteError(uiError(error));
    } finally {
      if (request === inviteRequest.current) setInviteBusy(false);
    }
  };
  const selectedSeat = buyIn === null ? null : game?.seats.find((seat) => seat.seat === buyIn);
  const seatReason = selectedSeat
    ? t('Bu koltuk artık dolu. Başka bir koltuk seç.')
    : own
      ? t('Zaten masadasın.')
      : '';

  const legal = array<string>(view.legalActions),
    myTurn = !!own && own.seat === game?.turn;
  const can = (action: string) =>
    ready &&
    !fixture &&
    !activity.busy &&
    legal.includes(action) &&
    (action === 'start'
      ? !!owner && !!own
      : myTurn &&
        !own?.pendingNextHand &&
        own?.connected === true &&
        view.ownRecovery?.takeover !== true &&
        view.ownRecovery?.pendingReturn !== true);
  const streetBet = Number(mine?.streetBet ?? 0),
    chips = Number(mine?.chips ?? own?.chips ?? 0),
    maximumBet = Number(view.maximumBet ?? 0),
    minRaise = maximumBet + Number(view.minimumRaise ?? 20),
    maxRaise = chips + streetBet,
    call = Math.max(0, maximumBet - streetBet);
  const deadline = Number(view.turnDeadline ?? 0);
  useEffect(() => {
    if (!playing || !deadline) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [playing, deadline]);
  useEffect(() => {
    setRaise(false);
    setHistory(false);
    setEnd(false);
    setBuyIn(null);
    setConfigure(false);
  }, [roomId, c.user?.id, game?.status, activity.room?.primary?.startedAt]);
  // Creating a table replaces the room's activity, which renews the command scope; go to the
  // new table on success instead of treating the scope change as a stale answer.
  const createTable = async (command: Extract<ActivityCommand, { type: 'game.create' }>) => {
    if (fixture || !ready || activity.busy || commandLock.current) return;
    commandLock.current = true;
    try {
      await activity.send(command);
      onCreate(null);
      navigate('/games?tab=table');
    } catch {
      /* The activity hook keeps and shows the real failure. */
    } finally {
      commandLock.current = false;
    }
  };
  const send = async (command: ActivityCommand) => {
    if (fixture || !ready || activity.busy || commandLock.current) return false;
    const scope = commandGeneration.current;
    commandLock.current = true;
    try {
      await activity.send(command);
      if (scope !== commandGeneration.current) return false;
      setRaise(false);
      setBuyIn(null);
      return true;
    } catch {
      return false; /* Activity hook retains the real failure. */
    } finally {
      commandLock.current = false;
    }
  };
  useEffect(() => {
    if (!fixture && (!playing || !myTurn || !legal.includes('raise'))) setRaise(false);
  }, [fixture, playing, myTurn, legal.join(',')]);
  const startReason = !own
    ? t('Oyunu başlatmak için önce otur')
    : !owner
      ? t('Oyunu yalnızca masa sahibi başlatabilir')
      : !ready
        ? t('Etkinlik bağlantısı bekleniyor')
        : !game ||
            game.seats.length <
              (game.kind === 'holdem' ? 2 : game.kind === 'blackjack' ? 1 : capacity)
          ? t('Başlamak için koltukları doldurun')
          : game.kind === 'holdem' &&
              game.seats.some(
                (seat) => seat.chips < Number(view.rules?.bigBlind ?? view.bigBlind ?? 20),
              )
            ? t('Bir oyuncunun fişi blind için yetersiz')
            : '';
  const roomName = c.channels.find((channel) => channel.id === roomId)?.name ?? t('Oda');
  const title =
    view.tableName ??
    tableTitle(activity.room?.primary?.title, game?.kind) ??
    (game ? names[game.kind] : t('Oyun alanı'));
  const seatName = (id: string) =>
    game?.seats.find((seat) => seat.userId === id)?.name ?? t('Oyuncu');
  const payouts = object(view.payouts),
    winners = Object.entries(payouts).filter(([, value]) => Number(value) > 0);
  // Highlight only server-delivered winning evaluations after public settlement.
  const winningCards = new Set(
    game?.status === 'finished'
      ? winners.flatMap(([id]) => view.showdown?.[id]?.bestFiveCardIds ?? [])
      : [],
  );
  const splitPot = view.pots?.some((item) => item.split) === true;
  const pot = array<{ amount: number }>(view.pots).length
    ? array<{ amount: number }>(view.pots).reduce((total, pot) => total + pot.amount, 0)
    : projected.reduce((total, seat) => total + Number(seat.contribution ?? 0), 0);
  const refresh = () => void activity.refresh();
  const newHand = () => void send({ type: 'game.action', action: 'start' });
  const action = (value: 'fold' | 'check' | 'call') =>
    void send({ type: 'game.action', action: value });
  const openRaise = () => {
    setAmount(Math.min(maxRaise, minRaise));
    setRaise(true);
  };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.repeat ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest('input, textarea, select, button, [role=dialog]'))) ||
        !playing ||
        !myTurn ||
        history ||
        raise ||
        rules ||
        end ||
        configure ||
        inviteOpen ||
        buyIn !== null ||
        create
      )
        return;
      const key = event.key.toLowerCase();
      if (key === 'f' && can('fold')) {
        event.preventDefault();
        action('fold');
      }
      if (key === 'c' && (can('check') || can('call'))) {
        event.preventDefault();
        action(can('check') ? 'check' : 'call');
      }
      if (key === 'r' && can('raise')) {
        event.preventDefault();
        openRaise();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [
    playing,
    myTurn,
    history,
    raise,
    rules,
    end,
    configure,
    inviteOpen,
    buyIn,
    create,
    ready,
    fixture,
    activity.busy,
    legal.join(','),
    minRaise,
    maxRaise,
  ]);
  const avatar = (seat: GamePublicState['seats'][number]) =>
    seat.bot ? <Avatar name={seat.name} /> : <VoiceAvatar id={seat.userId} name={seat.name} />;
  useEffect(() => {
    if (buyIn !== null) setEntry(view.rules?.initialChips ?? 1000);
  }, [buyIn]);
  const nativeRules = view.rules;
  const ruleRows: [string, string][] = [
    [t('Oyun'), game ? names[game.kind] : create ? names[create] : '—'],
    [t('Koltuk'), String(capacity)],
    ...(game?.kind === 'holdem'
      ? [
          [
            'Blind',
            t('{small} / {big} sanal fiş', {
              small: nativeRules?.smallBlind ?? '—',
              big: nativeRules?.bigBlind ?? String(view.bigBlind ?? '—'),
            }),
          ] as [string, string],
        ]
      : []),
    ...(game?.kind === 'holdem'
      ? ([
          [t('Giriş'), `${nativeRules?.minBuyIn ?? '—'} – ${nativeRules?.maxBuyIn ?? '—'}`],
          [t('İzleyici'), nativeRules?.spectatorsAllowed ? t('Açık') : t('Kapalı')],
        ] as [string, string][])
      : []),
  ];
  useEffect(() => {
    if (!fixtureMetadata) return;
    const ui = fixtureMetadata.ui;
    setRaise(ui.modal === 'raise');
    if (ui.amount !== null) {
      setAmount(ui.amount);
      setEntry(ui.amount);
    }
    setBuyIn(ui.modal === 'buy-in' ? ui.buyInSeat : null);
    setRules(ui.modal === 'rules');
  }, [fixtureMetadata]);
  if (create === 'batak' || create === '101')
    return (
      <ReferenceCreateGame
        kind={create}
        variant={variant}
        setVariant={setVariant}
        folding={folding}
        setFolding={setFolding}
        teams={teams}
        setTeams={setTeams}
        participants={activity.room?.participants ?? []}
        busy={activity.busy}
        disabled={fixture || !ready || createConflict}
        reason={
          fixture
            ? fixtureReason
            : !ready
              ? t('Etkinlik bağlantısı gerekli')
              : currentPrimary && !canReplace
                ? t('Açık etkinliği yalnızca hostu kapatabilir. Kapatıldığında masa açabilirsin.')
                : ''
        }
        consent={
          currentPrimary && canReplace
            ? {
                label: t('{tableTitle} etkinliğini bitir ve bu masayı kur', {
                  tableTitle: tableTitle(currentPrimary.title, game?.kind) ?? '',
                }),
                checked: replacementMatches,
                onChange: (checked) =>
                  setReplaceConsent(
                    checked
                      ? { activity: currentPrimary.activity, startedAt: currentPrimary.startedAt }
                      : undefined,
                  ),
              }
            : undefined
        }
        error={activity.error ?? ''}
        onCancel={() => onCreate(null)}
        onSubmit={() =>
          void createTable({
            type: 'game.create',
            game: create,
            ...(create === 'batak' ? { variant } : { folding, teams }),
            ...(canReplace && replacementMatches ? { replacePrimary: replaceConsent } : {}),
          })
        }
      />
    );
  return (
    <div className={`rg-page ${game && !waiting ? 'rg-playing' : ''}`}>
      <header className="rg-heading">
        <div>
          <div className="rg-title">
            <h1>
              {game
                ? game.status === 'finished'
                  ? t('El tamamlandı')
                  : title
                : t('Masa hazır. Sen de gel.')}
            </h1>
            {game && (
              <span>
                {game.seats.length} / {capacity}
              </span>
            )}
            {playing && <span>{t('Kurallar kilitli')}</span>}
          </div>
          <p>
            {game
              ? t('{roomName} · {names} · Sanal fiş', { roomName, names: names[game.kind] })
              : t('Bir oyun seç, arkadaşlarınla aynı masaya otur.')}
          </p>
        </div>
        <div>
          {waiting && (
            <button
              disabled={fixture || !roomId || c.status !== 'connected'}
              title={
                fixture
                  ? fixtureReason
                  : c.status !== 'connected'
                    ? t('Topluluk bağlantısı gerekli')
                    : undefined
              }
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus size={16} />
              {t('Arkadaş davet et')}
            </button>
          )}
          {game && own && (
            <button
              disabled={fixture || activity.busy || !ready}
              title={fixture ? fixtureReason : undefined}
              onClick={() => void send({ type: 'game.leave' })}
            >
              <X size={16} />
              {t('Masadan kalk')}
            </button>
          )}
          <button
            disabled={!!game && !access}
            title={game && !access ? t('Geçmiş için izleyici olarak katıl') : undefined}
            onClick={() => navigate('/games?tab=history')}
          >
            <History size={16} />
            {game ? t('Geçmiş') : t('Masa geçmişi')}
          </button>
          {game && (
            <IconButton label={t('Masayı yenile')} onClick={refresh}>
              <RefreshCw size={17} />
            </IconButton>
          )}
        </div>
      </header>
      {game && <GameRecovery activity={activity} game={game} />}
      {!ready && (
        <div className={`rg-banner ${activity.status === 'error' ? 'error' : ''}`} role="status">
          {activity.status === 'loading'
            ? t('Masalar getiriliyor…')
            : !roomId
              ? t('Oyun için bir oda seç.')
              : t('Oyun hizmeti bağlantısı bekleniyor.')}
          <button onClick={() => (!roomId ? navigate('/settings?tab=connections') : refresh())}>
            {!roomId ? t('Topluluğa bağlan') : t('Yeniden dene')}
          </button>
        </div>
      )}
      {!game ? (
        <>
          <div className="rg-catalog">
            {(['holdem', 'blackjack', 'batak', '101'] as const).map((kind) => (
              <article className={`rg-catalog-card ${kind}`} key={kind}>
                <div className="rg-catalog-art" aria-hidden="true">
                  {kind === '101' ? (
                    <div className="rg-art-tiles">
                      {[10, 11, 12].map((number) => (
                        <span key={number}>
                          {number}
                          <small>•</small>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="rg-art-cards">
                      {(kind === 'batak' ? ['A', 'K', 'Q'] : ['A', 'K']).map((rank, index) => (
                        <span key={rank} className={index === 1 && kind !== 'batak' ? 'red' : ''}>
                          {rank}
                          <b>{index === 1 && kind !== 'batak' ? '♥' : '♠'}</b>
                        </span>
                      ))}
                      {kind === 'holdem' && <i>100</i>}
                    </div>
                  )}
                </div>
                <div>
                  <h3>{names[kind]}</h3>
                  <p>
                    {kind === 'holdem'
                      ? t('2–9 oyuncu · Sanal fiş')
                      : kind === 'blackjack'
                        ? t('Otomatik krupiye · Sanal fiş')
                        : kind === 'batak'
                          ? t('4 tür · 3 veya 4 oyuncu')
                          : t('4 oyuncu · Tekli veya eşli')}
                  </p>
                  <button className="button secondary" onClick={() => onCreate(kind)}>
                    <Plus size={16} />
                    {t('Masa oluştur')}
                  </button>
                </div>
              </article>
            ))}
          </div>
          <section className="rg-active-tables">
            <h3>{t('Odanın masası')}</h3>
            <div>
              <Gamepad2 size={29} />
              <div>
                <strong>
                  {activity.status === 'loading'
                    ? t('Masalar getiriliyor')
                    : !ready
                      ? t('Masa bağlantısı bekleniyor')
                      : t('Açık oyun masası yok')}
                </strong>
                <p>
                  {activity.room?.primary
                    ? t('Bu odada {title} etkinliği açık.', { title: activity.room.primary.title })
                    : !ready
                      ? t('Masa durumu bağlantı kurulunca alınır.')
                      : t('Bir oyun seçerek masa oluşturabilirsin.')}
                </p>
              </div>
            </div>
          </section>
          <div className="rg-voice-note">
            <Headphones size={17} />
            <span>{t('Oyun penceresini kapatmak ses bağlantını kesmez.')}</span>
          </div>
          <p className="rg-footer-note">
            {t(
              'Yalnızca sanal fiş ve puan. Bir odada aynı anda tek ana medya veya oyun etkinliği başlatılabilir.',
            )}
          </p>
        </>
      ) : waiting ? (
        <>
          <div className="rg-lobby">
            <section>
              <div className="rg-section-heading">
                <h3>{t('Koltuklar')}</h3>
                <span>
                  {t('{capacity} koltuk · {names}', { capacity, names: names[game.kind] })}
                </span>
              </div>
              <div className="rg-seat-grid">
                {Array.from({ length: capacity }, (_, index) => {
                  const seat = game.seats.find((item) => item.seat === index);
                  return (
                    <div
                      className={`rg-lobby-seat ${seat ? '' : 'empty'} ${seat?.userId === c.user?.id ? 'you' : ''}`}
                      key={index}
                    >
                      {seat ? (
                        <>
                          {avatar(seat)}
                          <strong>{seat.name}</strong>
                          <small>
                            {seat.bot
                              ? t('Oyun botu')
                              : seat.userId === game.ownerId
                                ? t('Masa sahibi')
                                : seat.connected
                                  ? t('Masada')
                                  : t('Bağlantısı kesildi')}
                            {seat.userId === c.user?.id ? t(' · sen') : ''}
                          </small>
                        </>
                      ) : (
                        <>
                          <Plus size={23} />
                          <span>{t('Koltuk {number} boş', { number: index + 1 })}</span>
                          <div>
                            <button
                              disabled={!!own || !ready || fixture || activity.busy}
                              title={
                                fixture ? fixtureReason : own ? t('Zaten masadasın') : undefined
                              }
                              onClick={() => setBuyIn(index)}
                            >
                              {t('Otur')}
                            </button>
                            {owner && (
                              <button
                                disabled={!ready || fixture || activity.busy}
                                title={fixture ? fixtureReason : undefined}
                                onClick={() => void send({ type: 'game.bot.add', seat: index })}
                              >
                                <Bot size={12} />
                                {t('Bot ekle')}
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="rg-spectators">
                <Eye size={19} />
                <strong>{t('İzleyici')}</strong>
                <p>
                  {array<{ name: string }>(view.spectators)
                    .map((person) => person.name)
                    .join(' · ') || t('İzleyici yok')}
                </p>
                {!own && (
                  <button
                    disabled={
                      fixture ||
                      !ready ||
                      activity.busy ||
                      (game?.kind === 'holdem' && view.rules?.spectatorsAllowed === false)
                    }
                    onClick={() =>
                      void send({ type: 'game.watch', watching: view.watching !== true })
                    }
                  >
                    {view.watching ? t('İzlemeyi bırak') : t('İzle')}
                  </button>
                )}
              </div>
            </section>
            <aside className="rg-rules">
              <h3>
                {t('Masa kuralları')} <SlidersHorizontal size={19} />
              </h3>
              {game.kind === 'holdem' && owner && waiting && !game.history.length && (
                <button
                  className="text-button"
                  disabled={fixture || !ready || activity.busy || !nativeRules}
                  onClick={() => {
                    if (nativeRules) {
                      setHoldemRules(nativeRules);
                      setConfigure(true);
                    }
                  }}
                >
                  {t('Düzenle')}
                </button>
              )}
              {ruleRows.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
              <p>{t('Kurallar oyun başladığında kilitlenir.')}</p>
            </aside>
          </div>
          <div className="rg-hand-strip">
            <div>
              <h3>{game.seats.length === capacity ? t('Masa dolu') : t('Oyuncular bekleniyor')}</h3>
              <p>{startReason || t('Yeni el başlayabilir.')}</p>
            </div>
            {game.kind === 'blackjack' && own && (
              <label className="rg-lobby-bet">
                {t('Sanal bahis')}
                <input
                  type="number"
                  min={2}
                  max={own.chips}
                  step={2}
                  value={amount}
                  onChange={(event) => setAmount(Number(event.target.value))}
                />
                <button
                  disabled={
                    fixture ||
                    !ready ||
                    activity.busy ||
                    !Number.isInteger(amount) ||
                    amount < 2 ||
                    amount % 2 !== 0 ||
                    amount > own.chips
                  }
                  onClick={() => void send({ type: 'game.action', action: 'bet', amount })}
                >
                  {t('Bahsi belirle')}
                </button>
              </label>
            )}
            <button onClick={() => setRules(true)}>{t('Masa kuralları')}</button>
            <button
              className="button primary"
              disabled={!!startReason || !can('start')}
              title={fixture ? fixtureReason : startReason}
              onClick={newHand}
            >
              <Spade size={17} />
              {t('Oyunu başlat')}
            </button>
          </div>
        </>
      ) : !access ? (
        <section className="rx-watch">
          <Eye size={32} />
          <h2>{t('Masayı izle')}</h2>
          <p>
            {game?.kind === 'holdem' && view.rules?.spectatorsAllowed === false
              ? t('Bu masada izleyici erişimi kapalı.')
              : t('Masaya izleyici olarak katıl.')}
          </p>
          <button
            className="button primary"
            disabled={
              fixture ||
              !ready ||
              activity.busy ||
              (game?.kind === 'holdem' && view.rules?.spectatorsAllowed === false)
            }
            onClick={() => void send({ type: 'game.watch', watching: true })}
          >
            {t('İzle')}
          </button>
        </section>
      ) : (
        <>
          {!own && (
            <div className="rg-banner">
              {t('İzleyici · Gizli kartlar gösterilmez.')}
              <button
                disabled={fixture || !ready || activity.busy}
                onClick={() => void send({ type: 'game.watch', watching: false })}
              >
                {t('İzlemeyi bırak')}
              </button>
            </div>
          )}
          <div className={`rg-board count-${capacity} ${capacity > 6 ? 'rg-nine-layout' : ''}`}>
            <div className="rg-felt" />
            <div className="rg-center">
              <small>
                {(
                  {
                    preflop: 'Preflop',
                    flop: 'Flop',
                    turn: 'Turn',
                    river: 'River',
                    ended: t('El tamamlandı'),
                  } as Record<string, string>
                )[String(view.stage)] ?? t('Masa')}
              </small>
              <strong>
                <Coins size={18} />
                {pot.toLocaleString(locale)} <span>{t('pot')}</span>
              </strong>
              <div>
                {array<Card>(view.board).map((card) => (
                  <PlayingCard key={card.id} card={card} winning={winningCards.has(card.id)} />
                ))}
                {Array.from(
                  { length: Math.max(0, 5 - array<Card>(view.board).length) },
                  (_, index) => (
                    <span className="rg-card-outline" key={index} />
                  ),
                )}
              </div>
              {view.pots && (
                <div className="rg-pot-details">
                  {view.pots.map((item, index) => (
                    <span key={index}>
                      {item.kind === 'main'
                        ? t('Ana pot')
                        : t('Yan pot {number}', { number: index })}{' '}
                      · {item.amount.toLocaleString(locale)}
                      {item.split ? t(' · Paylaşıldı') : ''}
                      {item.winners.length
                        ? ` · ${item.winners.map((id) => `${seatName(id)}${Number.isFinite(item.awards[id]) ? ` +${item.awards[id].toLocaleString(locale)}` : ''}`).join(', ')}`
                        : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {Array.from({ length: capacity }, (_, index) => {
              const seat = game.seats.find((item) => item.seat === index),
                details = projected.find((item) => item.userId === seat?.userId);
              const isOwn = seat?.userId === c.user?.id;
              const slots: Record<number, number[]> = {
                1: [3],
                2: [0, 3],
                3: [0, 2, 3],
                4: [0, 1, 3, 5],
                5: [0, 1, 2, 3, 5],
                6: [0, 1, 2, 3, 4, 5],
                7: [0, 1, 2, 4, 6, 7, 8],
                8: [0, 1, 2, 3, 4, 5, 7, 8],
                9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
              };
              const positions = slots[capacity] ?? slots[9];
              const bottom = positions.indexOf(capacity > 6 ? 4 : 3);
              const position =
                positions[(index - (own?.seat ?? bottom) + bottom + capacity) % capacity];
              const deliveredCards = array<Card>(details?.cards);
              const visibleCards =
                isOwn || (game.status === 'finished' && !!view.showdown?.[seat?.userId ?? ''])
                  ? deliveredCards
                  : [];
              const hidden = Math.min(2, Math.max(0, Number(details?.hiddenCardCount ?? 0)));
              return (
                <div
                  className={`rg-table-seat p-${position} ${isOwn ? 'own' : ''} ${details?.folded ? 'folded' : ''} ${game.turn === index ? 'turn' : ''}`}
                  key={index}
                >
                  {seat ? (
                    <>
                      <div className="rg-seat-cards">
                        {visibleCards.map((card) => (
                          <PlayingCard
                            key={card.id}
                            card={card}
                            winning={winningCards.has(card.id)}
                          />
                        ))}
                        {Array.from({ length: hidden }, (_, i) => (
                          <PlayingCard key={i} />
                        ))}
                      </div>
                      <div className="rg-seat-info">
                        {avatar(seat)}
                        <div>
                          <strong>
                            {seat.name}
                            {isOwn ? t(' · sen') : ''}
                          </strong>
                          <small>
                            {Number(details?.chips ?? seat.chips).toLocaleString(locale)} {t('fiş')}
                            {seat.bot ? ' · BOT' : ''}
                          </small>
                        </div>
                        {Number(view.button) ===
                          projected.findIndex((item) => item.userId === seat.userId) && <b>D</b>}
                      </div>
                      <small>
                        {seat.pendingNextHand
                          ? t('Sonraki el bekleniyor')
                          : details?.folded
                            ? t('Eli bıraktı')
                            : game.status === 'finished' && Number(payouts[seat.userId]) > 0
                              ? `${splitPot ? t('Ortak kazanan') : t('Kazanan')}${view.showdown?.[seat.userId] ? ` · ${pokerCategory(view.showdown[seat.userId].category)}` : ''}`
                              : details && Number(details.chips) === 0 && playing
                                ? 'All-in'
                                : game.turn === index
                                  ? isOwn
                                    ? t('Sıra sende')
                                    : t('Sıra {name} kişisinde', { name: seat.name })
                                  : !seat.connected
                                    ? t('Bağlantısı kesildi')
                                    : details && Number(details.streetBet) > 0
                                      ? t('Bahis · {amount}', { amount: String(details.streetBet) })
                                      : t('Masada')}
                      </small>
                    </>
                  ) : (
                    <button
                      className="rg-empty-seat"
                      disabled={!!own || fixture || activity.busy || !ready}
                      title={
                        fixture
                          ? fixtureReason
                          : own
                            ? t('Zaten masadasın')
                            : playing
                              ? t('Sonraki el için katıl')
                              : undefined
                      }
                      onClick={() => setBuyIn(index)}
                    >
                      <Plus size={20} />
                      {t('Boş koltuk')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className={`rg-hand-strip ${game.status === 'finished' ? 'result' : ''}`}>
            <div>
              {game.status === 'finished' ? (
                <>
                  <h3>
                    <Trophy size={20} />
                    {splitPot
                      ? t('Pot paylaşıldı')
                      : winners.length > 1
                        ? t('Potlar dağıtıldı')
                        : t('El tamamlandı')}
                  </h3>
                  <p>
                    {winners
                      .map(
                        ([id, value]) =>
                          `${t('{name} · {chips} fiş', { name: seatName(id), chips: Number(value).toLocaleString(locale) })}${view.showdown?.[id] ? ` · ${pokerCategory(view.showdown[id].category)}` : ''}`,
                      )
                      .join(' / ') || t('Sonuç ayrıntısı bu yanıtta bulunmuyor.')}
                  </p>
                </>
              ) : (
                <>
                  <span className="eyebrow">{own ? t('ELİN') : t('CANLI MASA')}</span>
                  <h3>
                    {mine?.folded
                      ? t('Bu eli bıraktın')
                      : mine && Number(mine.chips) === 0
                        ? t('Bütün fişlerin masada')
                        : myTurn
                          ? t('Sıra sende')
                          : game.seats.find((seat) => seat.seat === game.turn)?.name
                            ? t('{name} bekleniyor', {
                                name: game.seats.find((seat) => seat.seat === game.turn)!.name,
                              })
                            : t('El devam ediyor')}
                  </h3>
                  {own && (
                    <p>
                      {t('Kalan fişin: {chips}', { chips: chips.toLocaleString(locale) })}
                      {view.ownHand ? ` · ${pokerCategory(view.ownHand.category)}` : ''}
                    </p>
                  )}
                </>
              )}
            </div>
            {playing && deadline > 0 && (
              <div className="rg-timer">
                <b>{Math.max(0, Math.ceil((deadline - now - activity.serverOffsetMs) / 1000))}</b>
                <span>
                  {myTurn ? t('Sıra sende') : t('Oyuncu bekleniyor')}
                  <small>{t('Sunucu hamle süresi')}</small>
                </span>
              </div>
            )}
            {playing && myTurn && (
              <div className="rg-actions">
                <button
                  className="button secondary"
                  disabled={!can('fold')}
                  title={fixture ? fixtureReason : undefined}
                  onClick={() => action('fold')}
                >
                  {t('Bırak')}
                </button>
                {legal.includes('check') ? (
                  <button
                    className="button secondary"
                    disabled={!can('check')}
                    onClick={() => action('check')}
                  >
                    {t('Kontrol et')}
                  </button>
                ) : (
                  <button
                    className="button secondary"
                    disabled={!can('call')}
                    onClick={() => action('call')}
                  >
                    {t('Gör · {min}', { min: Math.min(chips, call) })}
                  </button>
                )}
                <button className="button primary" disabled={!can('raise')} onClick={openRaise}>
                  {t('Artır · {min}', { min: Math.min(maxRaise, minRaise) })}
                </button>
              </div>
            )}
            {game.status === 'finished' && (
              <button
                className="button primary"
                disabled={!can('start') || !!startReason}
                title={fixture ? fixtureReason : startReason}
                onClick={newHand}
              >
                {t('Sonraki el')}
              </button>
            )}
            {own && !own.connected && (
              <button
                className="button secondary"
                disabled={fixture || !ready || activity.busy}
                onClick={() => void send({ type: 'game.sit', seat: own.seat })}
              >
                {t('Masaya geri dön')}
              </button>
            )}
          </div>
          <p className="rg-footer-note">
            {t(
              'Yalnızca sunucunun açtığı eller görünür. Katlanmış eller diğer oyunculara gösterilmez.',
            )}
          </p>
        </>
      )}
      {game && owner && (
        <button
          className="rg-end"
          disabled={fixture || activity.busy || !ready}
          title={fixture ? fixtureReason : undefined}
          onClick={() => setEnd(true)}
        >
          {t('Masayı kapat')}
        </button>
      )}
      {activity.error && (
        <div className="rg-banner error" role="alert">
          {activity.error}
        </div>
      )}
      {history && (!game || access) && (
        <Modal title={t('Masa geçmişi')} className="rg-modal" onClose={() => setHistory(false)}>
          <div className="rg-modal-body">
            {game?.history.length ? (
              game.history.map((hand) => (
                <div className="rg-history-row" key={hand.hand}>
                  <Trophy size={17} />
                  <strong>{t('El {hand}', { hand: hand.hand })}</strong>
                  <small>{new Date(hand.endedAt).toLocaleTimeString(locale)}</small>
                  <p>
                    {Object.entries(object(hand.result.payouts))
                      .map(([id, value]) =>
                        t('{seatName} · {chips} fiş', {
                          seatName: seatName(id),
                          chips: String(value),
                        }),
                      )
                      .join(' / ') || t('El tamamlandı')}
                  </p>
                </div>
              ))
            ) : (
              <p>{t('Tamamlanmış el yok.')}</p>
            )}
          </div>
        </Modal>
      )}
      {rules && (
        <Modal title={t('Masa kuralları')} className="rg-modal" onClose={() => setRules(false)}>
          <div className="rg-modal-body rg-rules">
            {ruleRows.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {buyIn !== null && (
        <Modal title={t('Masaya katıl')} className="rg-modal" onClose={() => setBuyIn(null)}>
          <div className="rg-modal-body">
            {game?.kind === 'holdem' ? (
              <>
                <div className="rg-buy-in">
                  <Coins size={28} />
                  <strong>{t('Sanal fiş')}</strong>
                </div>
                <label>
                  {t('Giriş miktarı')}
                  <input
                    autoFocus
                    type="number"
                    min={nativeRules?.minBuyIn}
                    max={nativeRules?.maxBuyIn}
                    value={entry}
                    onChange={(event) => setEntry(Number(event.target.value))}
                  />
                </label>
                <p>
                  {nativeRules
                    ? t('{minBuyIn} – {maxBuyIn} sanal fiş', {
                        minBuyIn: nativeRules.minBuyIn,
                        maxBuyIn: nativeRules.maxBuyIn,
                      })
                    : t('Masa giriş kuralları henüz alınmadı.')}
                </p>
                {playing && <p>{t('Bu el dağıtıldı. Sonraki elde oynayacaksın.')}</p>}
              </>
            ) : (
              <p>{t('Koltuk {number}', { number: buyIn + 1 })}</p>
            )}
            {seatReason && <p role="status">{seatReason}</p>}
            {activity.error && (
              <div className="rg-banner error" role="alert">
                {activity.error}
              </div>
            )}
          </div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => setBuyIn(null)}>
              {t('Vazgeç')}
            </button>
            <button
              className="button primary"
              disabled={
                fixture ||
                activity.busy ||
                !ready ||
                !!seatReason ||
                (game?.kind === 'holdem' &&
                  (!nativeRules ||
                    !Number.isInteger(entry) ||
                    entry < nativeRules.minBuyIn ||
                    entry > nativeRules.maxBuyIn))
              }
              onClick={() => {
                if (!seatReason)
                  void send({
                    type: 'game.sit',
                    seat: buyIn,
                    ...(game?.kind === 'holdem' ? { buyIn: entry } : {}),
                  });
              }}
            >
              {t('Katıl')}
            </button>
          </footer>
        </Modal>
      )}
      {raise && (
        <Modal
          title={t('Artırma tutarı')}
          className="rg-modal rg-raise"
          onClose={() => setRaise(false)}
        >
          <div className="rg-modal-body">
            <div className="rg-raise-call">
              <span>{t('Karşılanacak bahis')}</span>
              <strong>{t('{call} sanal fiş', { call })}</strong>
            </div>
            <label>
              {t('Bu turdaki toplam tutarın')}
              <input
                type="number"
                min={Math.min(minRaise, maxRaise)}
                max={maxRaise}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
            </label>
            <div className="rg-range">
              <span>{Math.min(minRaise, maxRaise)}</span>
              <input
                aria-label={t('Artırma tutarı')}
                type="range"
                min={Math.min(minRaise, maxRaise)}
                max={maxRaise}
                value={Number.isFinite(amount) ? amount : 0}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
              <span>{maxRaise}</span>
            </div>
            <div className="rg-raise-presets">
              <button
                className="button secondary"
                onClick={() => setAmount(Math.min(minRaise, maxRaise))}
              >
                {t('Minimum {min}', { min: Math.min(minRaise, maxRaise) })}
              </button>
              <button className="button secondary" onClick={() => setAmount(maxRaise)}>
                {t('All-in · {maxRaise}', { maxRaise })}
              </button>
            </div>
            <p>
              {maxRaise < minRaise
                ? t('All-in toplamı {maxRaise}. Minimum artırma için yeterli fişin yok.', {
                    maxRaise: maxRaise.toLocaleString(locale),
                  })
                : t(
                    'Minimum toplam artırma {minRaise}. Bunun {call} fişi görme, {max} fişi artırmadır.',
                    {
                      minRaise: minRaise.toLocaleString(locale),
                      call: call.toLocaleString(locale),
                      max: Math.max(0, minRaise - maximumBet).toLocaleString(locale),
                    },
                  )}
            </p>
            {activity.error && (
              <div className="rg-banner error" role="alert">
                {activity.error}
              </div>
            )}
          </div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => setRaise(false)}>
              {t('Vazgeç')}
            </button>
            <button
              className="button primary"
              disabled={
                !can('raise') ||
                !Number.isInteger(amount) ||
                amount < Math.min(minRaise, maxRaise) ||
                amount > maxRaise
              }
              onClick={() => void send({ type: 'game.action', action: 'raise', amount })}
            >
              {t('{amount} fişe artır', { amount })}
            </button>
          </footer>
        </Modal>
      )}
      {end && (
        <Modal title={t('Masayı kapat?')} className="rg-modal" onClose={() => setEnd(false)}>
          <div className="rg-modal-body">
            <p>{t('Oyun etkinliği biter. Ses bağlantısı bu işlemden bağımsızdır.')}</p>
            {activity.error && (
              <div className="rg-banner error" role="alert">
                {activity.error}
              </div>
            )}
          </div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => setEnd(false)}>
              {t('Vazgeç')}
            </button>
            <button
              className="button danger"
              disabled={fixture || activity.busy || !owner || !ready}
              onClick={() =>
                void send({ type: 'end' }).then((ok) => {
                  if (ok) setEnd(false);
                })
              }
            >
              {t('Masayı kapat')}
            </button>
          </footer>
        </Modal>
      )}
      {configure && (
        <Modal
          title={t('Masa kurallarını düzenle')}
          className="rg-modal"
          onClose={() => setConfigure(false)}
        >
          <div className="rg-modal-body">
            <HoldemRulesForm value={holdemRules} onChange={setHoldemRules} />
            {activity.error && <p role="alert">{activity.error}</p>}
          </div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => setConfigure(false)}>
              {t('Vazgeç')}
            </button>
            <button
              className="button primary"
              disabled={
                fixture ||
                !ready ||
                activity.busy ||
                !validHoldemRules(holdemRules) ||
                !owner ||
                !waiting ||
                !!game?.history.length
              }
              onClick={() =>
                void send({ type: 'game.configure', holdem: holdemRules }).then((ok) => {
                  if (ok) setConfigure(false);
                })
              }
            >
              {t('Kaydet')}
            </button>
          </footer>
        </Modal>
      )}
      {inviteOpen && (
        <Modal
          title={t('{roomName} daveti', { roomName })}
          className="rg-modal rg-invite"
          onClose={closeInvite}
        >
          <div className="rg-modal-body">
            <p>{t('Bu davet topluluğa katılmak içindir. Masada koltuk ayırmaz.')}</p>
            {invite ? (
              <InviteLinkCard serverUrl={c.serverUrl} invite={invite} autoFocus />
            ) : (
              <button
                className="button primary"
                disabled={fixture || inviteBusy || !roomId || c.status !== 'connected'}
                title={fixture ? fixtureReason : undefined}
                onClick={() => void generateInvite()}
              >
                {inviteBusy ? t('Oluşturuluyor…') : t('Davet oluştur')}
              </button>
            )}
            {inviteError && (
              <p className="rg-banner error" role="alert">
                {inviteError}
              </p>
            )}
          </div>
        </Modal>
      )}
      {create && (
        <Modal
          title={t('{names} masası', { names: names[create] })}
          className="rg-modal"
          onClose={() => onCreate(null)}
        >
          <div className="rg-modal-body">
            {create === 'holdem' && (
              <HoldemRulesForm value={holdemRules} onChange={setHoldemRules} />
            )}
            <p>{t('Yalnızca sanal fiş ve puan.')}</p>
            {activity.room?.primary && (
              <div className="rg-banner">
                {t('{tableTitle} etkinliği açık.', {
                  tableTitle: tableTitle(activity.room.primary.title, game?.kind) ?? '',
                })}
                {/* An old-cinema session has no page here; the consent below can still end it. */}
                {!retiredActivity(activity.room.primary.activity) && (
                  <button
                    onClick={() => {
                      onCreate(null);
                      navigate(game ? '/games?tab=table' : '/voice');
                    }}
                  >
                    {t('Etkinliği aç')}
                  </button>
                )}
                <label className="rg-replace-consent">
                  <input
                    type="checkbox"
                    checked={replacementMatches}
                    disabled={fixture || !canReplace || activity.busy}
                    onChange={(event) =>
                      setReplaceConsent(
                        event.target.checked && currentPrimary
                          ? {
                              activity: currentPrimary.activity,
                              startedAt: currentPrimary.startedAt,
                            }
                          : undefined,
                      )
                    }
                  />
                  <span>
                    {t('{tableTitle} etkinliğini bitir ve yeni masayı kur', {
                      tableTitle: tableTitle(currentPrimary?.title, game?.kind) ?? '',
                    })}
                  </span>
                </label>
                {!canReplace && (
                  <p>
                    {t(
                      'Açık etkinliği yalnızca hostu kapatabilir. Kapatıldığında masa açabilirsin.',
                    )}
                  </p>
                )}
                <p>{t('Ses bağlantısı devam eder. Mevcut kuyruk korunur.')}</p>
              </div>
            )}
          </div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => onCreate(null)}>
              {t('Vazgeç')}
            </button>
            <button
              className="button primary"
              disabled={
                fixture ||
                !ready ||
                activity.busy ||
                createConflict ||
                (create === 'holdem' && !validHoldemRules(holdemRules))
              }
              title={
                fixture
                  ? fixtureReason
                  : createConflict
                    ? t('Etkinliği değiştirmeyi onayla veya önce bitir')
                    : !ready
                      ? t('Etkinlik bağlantısı gerekli')
                      : undefined
              }
              onClick={() =>
                void createTable({
                  type: 'game.create',
                  game: create,
                  ...(create === 'holdem' ? { holdem: holdemRules } : {}),
                  ...(canReplace && replacementMatches ? { replacePrimary: replaceConsent } : {}),
                })
              }
            >
              {t('Masayı kur')}
            </button>
          </footer>
          {activity.error && (
            <div className="rg-banner error" role="alert">
              {activity.error}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

type GameAction = Extract<ActivityCommand, { type: 'game.action' }>['action'];
type TableUI = {
  game: GamePublicState;
  userId?: string;
  can(action: string): boolean;
  action(name: GameAction, extra?: Record<string, unknown>): Promise<boolean>;
  timer: number | null;
  busy: boolean;
};
function ReferenceOtherGame({
  activity,
  game,
}: {
  activity: ReturnType<typeof useActivityRoom>;
  game: GamePublicState;
}) {
  const fixtureMetadata = useGameFixtureMetadata(),
    navigate = useNavigate(),
    c = useCommunity(),
    own = game.seats.find((seat) => seat.userId === c.user?.id),
    owner = game.ownerId === c.user?.id;
  const fixture = import.meta.env.DEV && new URLSearchParams(location.search).has('fixture');
  const [rules, setRules] = useState(false),
    [history, setHistory] = useState(false),
    [end, setEnd] = useState(false),
    [now, setNow] = useState(Date.now()),
    [pending, setPending] = useState(false);
  const lock = useRef(false),
    scope = `${game.kind}:${game.history.length}:${c.user?.id}:${own?.seat}`,
    generation = useRef(scope);
  generation.current = scope;
  const ready = activity.status === 'connected',
    view = game.view,
    legal = array<string>(view.legalActions),
    busy = activity.busy || pending;
  const access = !!own || view.watching === true;
  const can = (name: string) =>
    !fixture &&
    ready &&
    !busy &&
    !!own &&
    (legal.includes(name) ||
      (name === 'bet' && game.kind === 'blackjack' && game.status !== 'playing')) &&
    (name === 'start' || name === 'bet' ? name === 'bet' || owner : own.seat === game.turn);
  const send = async (command: ActivityCommand) => {
    if (fixture || !ready || activity.busy || lock.current) return false;
    lock.current = true;
    setPending(true);
    const current = generation.current;
    try {
      await activity.send(command);
      return current === generation.current;
    } catch {
      return false;
    } finally {
      lock.current = false;
      setPending(false);
    }
  };
  const action: TableUI['action'] = (name, extra = {}) =>
    can(name) ? send({ type: 'game.action', action: name, ...extra }) : Promise.resolve(false);
  const deadline = Number(view.turnDeadline ?? 0);
  useEffect(() => {
    setNow(Date.now());
    if (!deadline || game.status !== 'playing') return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [deadline, game.status]);
  useEffect(() => {
    setRules(false);
    setHistory(false);
    setEnd(false);
  }, [scope]);
  useEffect(() => {
    if (fixtureMetadata) setRules(fixtureMetadata.ui.modal === 'rules');
  }, [fixtureMetadata]);
  const timer =
    deadline > 0 && game.status === 'playing'
      ? Math.max(0, Math.ceil((deadline - now - activity.serverOffsetMs) / 1000))
      : null;
  const ui: TableUI = { game, userId: c.user?.id, can, action, timer, busy };
  const roomName =
    c.channels.find((channel) => channel.id === activity.room?.roomId)?.name ?? t('Oda');
  const ruleRows: [string, string][] =
    game.kind === 'blackjack'
      ? [
          [t('Deste'), '6'],
          [t('Krupiye'), t('Soft 17’de durur (S17)')],
          ['Blackjack', '3:2'],
          ['Insurance', t('Kapalı')],
          ['Double', t('İlk iki kartta')],
          ['Split', t('Aynı puan değeri · En fazla 4 el')],
          [t('Split As'), t('Tek kart · yeniden ayırma kapalı')],
        ]
      : game.kind === 'batak'
        ? [
            [t('Tür'), String(view.variant ?? '—')],
            [t('Koz'), suits[String(view.trump)] ?? '—'],
            [t('Oyuncu'), String(game.seats.length)],
            [t('Gömmeli akışı'), t('İhale → koz → 4 kart gömme → oyun')],
          ]
        : [
            [t('Açılış'), '101'],
            [t('Çift açılışı'), t('5 çift')],
            [t('Katlamalı'), object(view.rules).folding ? t('Açık') : t('Kapalı')],
            [t('Eşli'), object(view.rules).teams ? t('Açık') : t('Kapalı')],
            [t('Bitirme'), t('Son taş atılır')],
          ];
  return (
    <div className={`rg-page rx-game rx-${game.kind}`}>
      <header className="rg-heading">
        <div>
          <div className="rg-title">
            <h1>{game.status === 'finished' ? t('El tamamlandı') : names[game.kind]}</h1>
            <span>{t('Kurallar kilitli')}</span>
          </div>
          <p>
            {roomName} · {names[game.kind]} ·{' '}
            {game.kind === 'blackjack' ? t('Sanal fiş') : t('Sanal puan')}
          </p>
        </div>
        <div>
          <button onClick={() => setRules(true)}>
            <ShieldCheck size={16} />
            {t('Masa kuralları')}
          </button>
          <button
            disabled={!access}
            title={!access ? t('Geçmiş için izleyici olarak katıl') : undefined}
            onClick={() => navigate('/games?tab=history')}
          >
            <History size={16} />
            {t('Geçmiş')}
          </button>
          <IconButton label={t('Masayı yenile')} onClick={() => void activity.refresh()}>
            <RefreshCw size={16} />
          </IconButton>
          {own && (
            <button
              disabled={fixture || !ready || busy}
              onClick={() => void send({ type: 'game.leave' })}
            >
              {t('Masadan kalk')}
            </button>
          )}
        </div>
      </header>
      <GameRecovery activity={activity} game={game} />
      {activity.error && (
        <div className="rg-banner error" role="alert">
          <span>{activity.error}</span>
          <button onClick={() => void activity.refresh()}>{t('Yeniden dene')}</button>
        </div>
      )}
      {!ready && !activity.error && (
        <div className="rg-banner" role="status">
          <span>{t('Masa bağlantısı bekleniyor.')}</span>
          <button onClick={() => void activity.refresh()}>{t('Yeniden dene')}</button>
        </div>
      )}
      {!access ? (
        <section className="rx-watch">
          <Eye size={32} />
          <h2>{t('Masayı izle')}</h2>
          <p>
            {game.kind === 'holdem' && view.rules?.spectatorsAllowed === false
              ? t('Bu masada izleyici erişimi kapalı.')
              : t('Masaya izleyici olarak katıl.')}
          </p>
          <button
            className="button primary"
            disabled={
              fixture ||
              !ready ||
              busy ||
              (game?.kind === 'holdem' && view.rules?.spectatorsAllowed === false)
            }
            title={
              fixture
                ? t('Yerel örnekte hesap işlemleri kapalı')
                : game?.kind === 'holdem' && view.rules?.spectatorsAllowed === false
                  ? t('Masa izleyici kabul etmiyor')
                  : undefined
            }
            onClick={() => void send({ type: 'game.watch', watching: true })}
          >
            {t('İzle')}
          </button>
        </section>
      ) : (
        <>
          {!own && (
            <div className="rg-banner">
              <Eye size={17} />
              {t('İzleyici · Gizli eller gösterilmez.')}
              <button
                disabled={fixture || !ready || busy}
                onClick={() => void send({ type: 'game.watch', watching: false })}
              >
                {t('İzlemeyi bırak')}
              </button>
            </div>
          )}
          {game.kind === 'blackjack' ? (
            <ReferenceBlackjack {...ui} />
          ) : game.kind === 'batak' ? (
            <ReferenceBatak {...ui} />
          ) : (
            <ReferenceOkey {...ui} />
          )}
        </>
      )}

      {game.status === 'finished' && own && (
        <div className="rg-hand-strip result">
          <div>
            <h3>
              <Trophy size={19} />
              {t('El tamamlandı')}
            </h3>
            <p>{owner ? t('Yeni el başlatabilirsin.') : t('Masa sahibi bekleniyor.')}</p>
          </div>
          <button
            className="button primary"
            disabled={!can('start')}
            onClick={() => void action('start')}
          >
            {t('Sonraki el')}
          </button>
        </div>
      )}
      {owner && (
        <button
          className="rg-end"
          disabled={fixture || busy || !ready}
          onClick={() => setEnd(true)}
        >
          {t('Masayı kapat')}
        </button>
      )}
      {rules && (
        <Modal title={t('Masa kuralları')} className="rg-modal" onClose={() => setRules(false)}>
          <div className="rg-modal-body rg-rules">
            {ruleRows.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {history && access && (
        <Modal title={t('Masa geçmişi')} className="rg-modal" onClose={() => setHistory(false)}>
          <div className="rg-modal-body">
            {game.history.length ? (
              game.history.map((hand) => (
                <div className="rg-history-row" key={hand.hand}>
                  <Trophy size={16} />
                  <strong>{t('El {hand}', { hand: hand.hand })}</strong>
                  <small>{new Date(hand.endedAt).toLocaleString(locale)}</small>
                  <GameResults game={game} result={hand.result} />
                </div>
              ))
            ) : (
              <p>{t('Tamamlanmış el yok.')}</p>
            )}
          </div>
        </Modal>
      )}
      {end && (
        <Modal title={t('Masayı kapat?')} className="rg-modal" onClose={() => setEnd(false)}>
          <div className="rg-modal-body">
            <p>{t('Oyun etkinliği biter. Ses bağlantısı açık kalır.')}</p>
            {activity.error && <p role="alert">{activity.error}</p>}
          </div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => setEnd(false)}>
              {t('Vazgeç')}
            </button>
            <button
              className="button danger"
              disabled={fixture || !ready || busy}
              onClick={() =>
                void send({ type: 'end' }).then((ok) => {
                  if (ok) setEnd(false);
                })
              }
            >
              {t('Masayı kapat')}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
function GameResults({ game, result }: { game: GamePublicState; result: Record<string, unknown> }) {
  const scores = array<number>(result.scores),
    results = array<Record<string, unknown>>(result.results);
  if (scores.length)
    return (
      <table className="rx-results">
        <thead>
          <tr>
            <th>{t('Oyuncu')}</th>
            <th>{t('Puan')}</th>
          </tr>
        </thead>
        <tbody>
          {game.seats.map((seat, index) => (
            <tr key={seat.userId}>
              <td>{seat.name}</td>
              <td>{scores[seat.seat] ?? scores[index] ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  if (results.length)
    return (
      <div className="rx-results">
        {results.map((item, index) => (
          <p key={index}>
            {t('{name} · El {hand}', {
              name: game.seats.find((seat) => seat.userId === item.userId)?.name ?? t('Oyuncu'),
              hand: Number(item.hand) + 1,
            })}{' '}
            ·{' '}
            {(
              {
                win: t('Kazandı'),
                lose: t('Kaybetti'),
                push: t('Berabere'),
                blackjack: 'Blackjack',
              } as Record<string, string>
            )[String(item.outcome)] ?? String(item.outcome ?? t('Sonuç'))}{' '}
            {t('· {amount} fiş geri aldı', { amount: Number(item.returned) })}
          </p>
        ))}
      </div>
    );
  return <p>{t('Sonuç ayrıntısı bu yanıtta bulunmuyor.')}</p>;
}
function TurnClock({ timer }: { timer: number | null }) {
  return timer === null ? null : (
    <div className="rg-timer">
      <Clock3 size={18} />
      <b>{timer}</b>
      <span>{t('saniye')}</span>
    </div>
  );
}
function ReferenceBlackjack({ game, userId, can, action, timer }: TableUI) {
  const view = game.view,
    players = array<Record<string, unknown>>(view.players),
    own = game.seats.find((seat) => seat.userId === userId),
    mine = players.find((player) => player.userId === userId);
  const hands = array<Record<string, unknown>>(mine?.hands),
    dealer = array<Card>(view.dealer);
  const [bet, setBet] = useState(20);
  return (
    <>
      <div className="rx-badges">
        <span>{t('6 deste')}</span>
        <span>Soft 17 · S17</span>
        <span>Blackjack 3:2</span>
        <span>{t('Insurance kapalı')}</span>
        <span>{t('El {hand}', { hand: game.history.length + 1 })}</span>
      </div>
      <section className="rx-blackjack-felt">
        <div className="rx-dealer">
          <small>{t('KRUPİYE')}</small>
          <div>
            {dealer.map((card) => (
              <PlayingCard key={card.id} card={card} />
            ))}
            {Array.from(
              { length: Math.max(0, Number(view.dealerHiddenCount ?? 0)) },
              (_, index) => (
                <PlayingCard key={index} />
              ),
            )}
          </div>
          {dealer.length > 0 && <strong>{blackjackTotal(dealer as EngineCard[])}</strong>}
        </div>
        <div className="rx-felt-brand" aria-hidden="true">
          BLACKJACK <span>PAYS 3:2</span>
        </div>
        <div className="rx-blackjack-hands">
          {hands.map((hand, index) => {
            const cards = array<Card>(hand.cards),
              active =
                game.status === 'playing' &&
                own?.seat === game.turn &&
                Number(mine?.activeHand) === index;
            return (
              <article
                className={`${active ? 'active' : ''} ${hand.state === 'bust' ? 'bust' : ''}`}
                key={index}
              >
                <small>
                  {t('EL {hand} ·', { hand: index + 1 })}{' '}
                  {active
                    ? t('Sıra sende')
                    : hand.state === 'bust'
                      ? t('Aştı')
                      : hand.state === 'stood'
                        ? t('Durdu')
                        : t('El tamamlandı')}
                </small>
                <div>
                  {cards.map((card) => (
                    <PlayingCard key={card.id} card={card} />
                  ))}
                </div>
                <strong>{blackjackTotal(cards as EngineCard[])}</strong>
                <p>{t('{amount} sanal fiş', { amount: Number(hand.bet) })}</p>
              </article>
            );
          })}
        </div>
      </section>
      <div className="rx-player-row">
        {game.seats.map((seat) => (
          <article className={seat.userId === userId ? 'own' : ''} key={seat.userId}>
            <Avatar name={seat.name} />
            <div>
              <strong>
                {seat.name}
                {seat.userId === userId ? t(' · sen') : ''}
              </strong>
              <small>
                {Number(
                  players.find((player) => player.userId === seat.userId)?.credits ?? seat.chips,
                )}{' '}
                {t('fiş')}
              </small>
            </div>
          </article>
        ))}
      </div>
      {game.status === 'finished' && <GameResults game={game} result={view} />}
      {own && (
        <div className="rg-hand-strip">
          <div>
            <h3>
              {own.seat === game.turn
                ? t('Sıra sende')
                : game.status === 'finished'
                  ? t('El tamamlandı')
                  : t('Oyuncu bekleniyor')}
            </h3>
          </div>
          <TurnClock timer={timer} />
          {game.status === 'playing' ? (
            <div className="rg-actions">
              {(
                [
                  ['hit', t('Kart al')],
                  ['stand', t('Dur')],
                  ['double', t('İkiye katla')],
                  ['split', t('Ayır')],
                  ['insurance', t('Sigorta al')],
                  ['decline-insurance', t('Sigorta alma')],
                  ['surrender', t('Teslim ol')],
                ] as const
              )
                // Insurance (dealer shows an ace) and surrender (table rule) appear only when the server offers them.
                .filter(
                  ([name]) =>
                    !['insurance', 'decline-insurance', 'surrender'].includes(name) ||
                    can(name),
                )
                .map(([name, label]) => (
                  <button
                    className={`button ${name === 'hit' ? 'primary' : 'secondary'}`}
                    key={name}
                    disabled={!can(name)}
                    title={
                      !can(name) ? t('Bu hamle şu anda sunucu tarafından izinli değil') : undefined
                    }
                    onClick={() => void action(name)}
                  >
                    {label}
                  </button>
                ))}
            </div>
          ) : (
            <label className="rg-lobby-bet">
              {t('Sonraki el bahsi')}
              <input
                type="number"
                min={2}
                step={2}
                max={own.chips}
                value={bet}
                onChange={(event) => setBet(Number(event.target.value))}
              />
              <button
                disabled={
                  !can('bet') ||
                  !Number.isInteger(bet) ||
                  bet < 2 ||
                  bet % 2 !== 0 ||
                  bet > own.chips
                }
                onClick={() => void action('bet', { amount: bet })}
              >
                {t('Bahsi belirle')}
              </button>
            </label>
          )}
        </div>
      )}
    </>
  );
}
function ReferenceBatak({ game, userId, can, action, timer }: TableUI) {
  const view = game.view,
    own = game.seats.find((seat) => seat.userId === userId),
    hands = array<Record<string, unknown>>(view.hands),
    mine = hands.find((hand) => hand.seat === own?.seat),
    cards = array<Card>(mine?.cards),
    stage = String(view.stage),
    variant = String(view.variant);
  const minimum =
      variant === 'koz-maca'
        ? 1
        : Math.max(variant === 'esli' || variant === 'gommeli' ? 8 : 5, Number(view.bid ?? 0) + 1),
    maximum = variant === 'gommeli' ? 16 : 13;
  const [bid, setBid] = useState(minimum),
    [selected, setSelected] = useState<string[]>([]),
    [trump, setTrump] = useState('spades');
  const cardIds = cards.map((card) => card.id).join('|');
  useEffect(() => {
    setBid(minimum);
    setSelected([]);
    setTrump('spades');
  }, [stage, game.history.length, own?.seat]);
  useEffect(() => {
    setSelected((ids) => ids.filter((id) => cards.some((card) => card.id === id)));
  }, [cardIds]);
  const trick = array<{ seat: number; card: Card }>(view.trick),
    valid =
      stage === 'playing' && cards.length
        ? legalBatakCards(
            cards as EngineCard[],
            trick as { seat: number; card: EngineCard }[],
            String(view.trump) as Suit,
          ).map((card) => card.id)
        : [];
  const bids = array<number>(view.bids),
    tricks = array<number>(view.tricks);
  const toggle = (id: string) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : ids.length < 4 ? [...ids, id] : ids,
    );
  return (
    <>
      <div className="rx-badges">
        <span>
          {(
            {
              ihaleli: t('İhaleli'),
              esli: t('Eşli'),
              'koz-maca': t('Koz Maça'),
              gommeli: t('Gömmeli'),
            } as Record<string, string>
          )[variant] ?? 'Batak'}
        </span>
        <span>{t('İhale {bid}', { bid: view.bid ? String(view.bid) : '—' })}</span>
        <span>
          {t('Koz {trump}', {
            trump:
              stage === 'bidding' && variant !== 'koz-maca'
                ? '—'
                : (suits[String(view.trump)] ?? '—'),
          })}
        </span>
        <span>{t('El {hand}', { hand: game.history.length + 1 })}</span>
      </div>
      {['bidding', 'trump', 'bury'].includes(stage) ? (
        <div className="rx-batak-setup">
          <section>
            <header>
              <h2>
                {stage === 'bidding'
                  ? t('İhale ver')
                  : stage === 'trump'
                    ? t('Koz seç')
                    : t('4 kart göm')}
              </h2>
              <TurnClock timer={timer} />
            </header>
            {stage === 'bidding' ? (
              <>
                <p>
                  {own?.seat === game.turn
                    ? t('Sıra sende')
                    : t('{name} bekleniyor', {
                        name:
                          game.seats.find((seat) => seat.seat === game.turn)?.name ?? t('Oyuncu'),
                      })}
                </p>
                <div className="rx-bid-grid">
                  {Array.from(
                    { length: Math.max(0, maximum - minimum + 1) },
                    (_, index) => minimum + index,
                  ).map((value) => (
                    <button
                      key={value}
                      className={bid === value ? 'selected' : ''}
                      disabled={!can('bid')}
                      onClick={() => setBid(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <footer>
                  <button
                    className="button secondary"
                    disabled={!can('pass')}
                    onClick={() => void action('pass')}
                  >
                    {t('Pas')}
                  </button>
                  <button
                    className="button primary"
                    disabled={!can('bid') || bid < minimum || bid > maximum}
                    onClick={() => void action('bid', { amount: bid })}
                  >
                    {t('{bid} · İhale ver', { bid })}
                  </button>
                </footer>
              </>
            ) : stage === 'trump' ? (
              <>
                <div className="rx-trump">
                  {Object.entries(suits).map(([suit, symbol]) => (
                    <button
                      className={`${trump === suit ? 'selected' : ''} ${suit === 'hearts' || suit === 'diamonds' ? 'red' : ''}`}
                      key={suit}
                      disabled={!can('trump')}
                      onClick={() => setTrump(suit)}
                    >
                      {symbol}
                      <small>
                        {
                          (
                            {
                              clubs: t('Sinek'),
                              diamonds: t('Karo'),
                              hearts: t('Kupa'),
                              spades: t('Maça'),
                            } as Record<string, string>
                          )[suit]
                        }
                      </small>
                    </button>
                  ))}
                </div>
                <footer>
                  <button
                    className="button primary"
                    disabled={!can('trump')}
                    onClick={() => void action('trump', { trump })}
                  >
                    {t('Kozu onayla')}
                  </button>
                </footer>
              </>
            ) : (
              <>
                <div className="rx-bury-cards">
                  {cards.map((card) => (
                    <PlayingCard
                      key={card.id}
                      card={card}
                      selected={selected.includes(card.id)}
                      disabled={
                        !can('bury') || (selected.length === 4 && !selected.includes(card.id))
                      }
                      onClick={() => toggle(card.id)}
                    />
                  ))}
                </div>
                <footer>
                  <span>{t('{selectedCount} / 4 kart', { selectedCount: selected.length })}</span>
                  <button
                    className="button primary"
                    disabled={!can('bury') || selected.length !== 4}
                    onClick={() =>
                      void action('bury', { tileIds: selected }).then((ok) => {
                        if (ok) setSelected([]);
                      })
                    }
                  >
                    {t('4 kartı göm')}
                  </button>
                </footer>
              </>
            )}
          </section>
          <aside>
            <h3>{t('Oyuncular')}</h3>
            {game.seats.map((seat) => (
              <div className="rx-bid-player" key={seat.userId}>
                <Avatar name={seat.name} />
                <strong>{seat.name}</strong>
                <span>
                  {bids[seat.seat] > 0
                    ? t('{bid} ihale', { bid: bids[seat.seat] })
                    : seat.seat === game.turn
                      ? t('Sıra onda')
                      : '—'}
                </span>
              </div>
            ))}
          </aside>
        </div>
      ) : (
        <>
          <section className="rx-batak-felt">
            <div className="rx-batak-center">
              {trick.length ? (
                trick.map((play, index) => (
                  <div style={{ transform: `rotate(${index * 8 - 10}deg)` }} key={play.card.id}>
                    <PlayingCard card={play.card} />
                    <small>{game.seats.find((seat) => seat.seat === play.seat)?.name}</small>
                  </div>
                ))
              ) : (
                <span>
                  {game.status === 'finished' ? t('El tamamlandı') : t('Kart bekleniyor')}
                </span>
              )}
            </div>
            {game.seats.map((seat) => {
              const relative =
                (seat.seat - (own?.seat ?? 0) + game.seats.length) % game.seats.length;
              return (
                <article
                  className={`rx-batak-seat side-${relative} ${seat.userId === userId ? 'own' : ''} ${seat.seat === game.turn ? 'turn' : ''}`}
                  key={seat.userId}
                >
                  <Avatar name={seat.name} />
                  <strong>{seat.name}</strong>
                  <small>
                    {t('{tricks} el · {cards} kart', {
                      tricks: tricks[seat.seat] ?? 0,
                      cards: Number(hands.find((hand) => hand.seat === seat.seat)?.count ?? 0),
                    })}
                  </small>
                  {seat.userId !== userId &&
                    Number(hands.find((hand) => hand.seat === seat.seat)?.count ?? 0) > 0 && (
                      <PlayingCard />
                    )}
                </article>
              );
            })}
          </section>
          {game.status === 'finished' && <GameResults game={game} result={view} />}
        </>
      )}
      {own && stage !== 'bury' && game.status === 'playing' && (
        <section className="rx-rack">
          <header>
            <strong>{t('ELİN · {count} kart', { count: cards.length })}</strong>
            <TurnClock timer={['bidding', 'trump'].includes(stage) ? null : timer} />
          </header>
          <div className="rx-card-rack">
            {cards.map((card) => (
              <PlayingCard
                key={card.id}
                card={card}
                disabled={!can('play') || !valid.includes(card.id)}
                onClick={() => void action('play', { cardId: card.id })}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
function OkeyTileView({
  tile,
  selected,
  onClick,
  disabled,
  small = false,
}: {
  tile: Tile;
  selected?: boolean;
  onClick?(): void;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      className={`rx-tile ${tile.color} ${selected ? 'selected' : ''} ${small ? 'small' : ''}`}
      disabled={disabled || !onClick}
      onClick={onClick}
      aria-pressed={onClick ? !!selected : undefined}
      aria-label={
        tile.joker ? t('Okey taşı') : `${tileColors[tile.color] ?? tile.color} ${tile.value}`
      }
    >
      <strong>{tile.joker ? '★' : tile.value}</strong>
      <span>•</span>
    </button>
  );
}
function previewOkeyGroup(tiles: Tile[], pairs: boolean): OkeyTile[] {
  const result = tiles.map((tile) => ({ ...tile })) as OkeyTile[];
  if (!result.some((tile) => tile.joker)) return result;
  const fixed = result.map((tile, index) => ({ tile, index })).filter((item) => !item.tile.joker);
  if (!fixed.length) {
    if (pairs && result.length === 2) return result;
    throw new Error('MELD_NEEDS_NATURAL_TILE');
  }
  if (pairs) {
    if (result.length !== 2) throw new Error('PAIR_REQUIRED');
    return result.map((tile) =>
      tile.joker ? { ...tile, color: fixed[0].tile.color, value: fixed[0].tile.value } : tile,
    );
  }
  if (
    fixed.every(
      (item) =>
        item.tile.color === fixed[0].tile.color &&
        item.tile.value - item.index === fixed[0].tile.value - fixed[0].index,
    )
  )
    return result.map((tile, index) =>
      tile.joker
        ? {
            ...tile,
            color: fixed[0].tile.color,
            value: fixed[0].tile.value - fixed[0].index + index,
          }
        : tile,
    );
  if (
    fixed.every((item) => item.tile.value === fixed[0].tile.value) &&
    new Set(fixed.map((item) => item.tile.color)).size === fixed.length
  ) {
    const unused = (['red', 'yellow', 'blue', 'black'] as OkeyTile['color'][]).filter(
      (color) => !fixed.some((item) => item.tile.color === color),
    );
    return result.map((tile) =>
      tile.joker ? { ...tile, color: unused.shift()!, value: fixed[0].tile.value } : tile,
    );
  }
  throw new Error('INVALID_WILDCARD_MELD');
}
function ReferenceOkey({ game, userId, can, action, timer }: TableUI) {
  const fixtureMetadata = useGameFixtureMetadata();
  const view = game.view,
    own = game.seats.find((seat) => seat.userId === userId),
    hands = array<Record<string, unknown>>(view.hands),
    tiles = own ? array<Tile>(hands.find((hand) => hand.seat === own.seat)?.tiles) : [],
    melds = array<{ owner: number; tiles: Tile[]; pairs: boolean }>(view.melds),
    rules = object(view.rules),
    opened = array<string | null>(view.opened)[own?.seat ?? -1],
    stage = String(view.stage);
  const [selected, setSelected] = useState<string[]>([]),
    [groups, setGroups] = useState<string[][]>([]),
    [pairs, setPairs] = useState(false),
    [target, setTarget] = useState<number | null>(null),
    [joker, setJoker] = useState(''),
    [sorted, setSorted] = useState(false);
  const ids = tiles.map((tile) => tile.id).join('|');
  useEffect(() => {
    setSelected([]);
    setGroups([]);
    setPairs(opened === 'pairs');
    setTarget(null);
    setJoker('');
  }, [game.history.length, game.status, own?.seat, userId]);
  useEffect(() => {
    const available = new Set(tiles.map((tile) => tile.id));
    setSelected((values) => values.filter((id) => available.has(id)));
    setGroups((values) => values.filter((group) => group.every((id) => available.has(id))));
  }, [ids]);
  useEffect(() => {
    if (stage === 'draw') {
      setSelected([]);
      setGroups([]);
      setTarget(null);
      setJoker('');
    }
  }, [stage]);
  useEffect(() => {
    if (opened) setPairs(opened === 'pairs');
  }, [opened]);
  useEffect(() => {
    if (!fixtureMetadata || fixtureMetadata.id !== 'S50') return;
    const ui = fixtureMetadata.ui;
    setSelected(ui.selectedTileIds);
    setGroups(ui.groups);
    setPairs(ui.pairs);
    setTarget(ui.targetMeld);
  }, [fixtureMetadata]);
  const toggle = (id: string) =>
    setSelected((values) =>
      values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
    );
  const used = groups.flat(),
    display = sorted
      ? [...tiles].sort((a, b) => a.color.localeCompare(b.color) || a.value - b.value)
      : tiles;
  const grouped = groups.map((group) =>
    group.map((id) => tiles.find((tile) => tile.id === id)).filter((tile): tile is Tile => !!tile),
  );
  const threshold = rules.folding ? Math.max(101, Number(view.highestOpening ?? 100) + 1) : 101;
  let total = 0,
    validation = '';
  try {
    const preview = grouped.map((group) => previewOkeyGroup(group, pairs));
    total = preview.flat().reduce((sum, tile) => sum + tile.value, 0);
    if (!groups.length) validation = t('Açmak için seri veya çift hazırla');
    else if (used.length >= tiles.length) validation = t('Atmak için bir taş bırak');
    else if (!opened) {
      const profile = {
        id: 'rooms-101-v1' as const,
        folding: !!rules.folding,
        teams: !!rules.teams,
        openingMinimum: 101 as const,
        pairsMinimum: 5 as const,
      };
      if (pairs) validate101Pairs(tiles as OkeyTile[], preview, profile);
      else
        validate101Opening(
          tiles as OkeyTile[],
          preview,
          profile,
          Number(view.highestOpening ?? 100),
        );
    } else if (pairs) {
      if (
        preview.some(
          (group) =>
            group.length !== 2 ||
            group[0].color !== group[1].color ||
            group[0].value !== group[1].value,
        )
      )
        validation = t('Geçerli çift hazırla');
    } else preview.forEach(validate101Meld);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    validation =
      code === 'OPENING_TOO_LOW'
        ? t('Açılış için en az {threshold} puan gerekir', { threshold })
        : code === 'INVALID_PAIRS_OPENING'
          ? t('En az 5 geçerli çift gerekir')
          : t('Hazır gruplardan biri geçersiz');
  }
  const discards = array<Tile[]>(view.discards),
    previous = own ? discards[(own.seat + 3) % 4]?.[0] : undefined;
  const commit = () =>
    void action(pairs ? 'open-pairs' : 'open', { melds: groups }).then((ok) => {
      if (ok) {
        setGroups([]);
        setSelected([]);
      }
    });
  return (
    <>
      <div className="rx-badges">
        <span>{rules.folding ? t('Katlamalı') : t('Katlamasız')}</span>
        <span>{rules.teams ? t('Eşli') : t('Tekli')}</span>
        <span>{t('Açılış {threshold}', { threshold })}</span>
        <span>{t('5 çift')}</span>
        <span>{t('El {hand}', { hand: game.history.length + 1 })}</span>
      </div>
      <section className="rx-okey-felt">
        <div className="rx-okey-players">
          {game.seats
            .filter((seat) => seat.userId !== userId)
            .map((seat) => (
              <article className={seat.seat === game.turn ? 'turn' : ''} key={seat.userId}>
                <Avatar name={seat.name} />
                <strong>{seat.name}</strong>
                <small>
                  {t('{count} taş · {state}', {
                    count: Number(hands.find((hand) => hand.seat === seat.seat)?.count ?? 0),
                    state: array<string | null>(view.opened)[seat.seat] ? t('Açtı') : t('Açmadı'),
                  })}
                </small>
              </article>
            ))}
        </div>
        <div className="rx-okey-middle">
          <div className="rx-public-melds">
            {melds.length ? (
              melds.map((meld, index) => (
                <button
                  className={target === index ? 'selected' : ''}
                  key={index}
                  disabled={!can('process') || meld.pairs}
                  onClick={() => {
                    setTarget(index);
                    setJoker('');
                  }}
                >
                  <small>
                    {game.seats.find((seat) => seat.seat === meld.owner)?.name ?? t('Oyuncu')} ·{' '}
                    {meld.pairs ? t('Çift') : t('Seri')}
                  </small>
                  <span>
                    {meld.tiles.map((tile) => (
                      <span className={`rx-tile small ${tile.color}`} key={tile.id}>
                        {tile.joker ? '★' : tile.value}
                      </span>
                    ))}
                  </span>
                </button>
              ))
            ) : (
              <p>{t('Henüz seri açılmadı.')}</p>
            )}
          </div>
          <aside>
            <span>{t('Kapalı taşlar')}</span>
            <strong>{String(view.remainingStock ?? '—')}</strong>
            {!!view.indicator && (
              <>
                <small>{t('Gösterge')}</small>
                <OkeyTileView tile={view.indicator as Tile} />
              </>
            )}
          </aside>
        </div>
        <div className="rx-discards">
          {discards.map((stack, index) => (
            <div key={index}>
              <small>
                {t('{name} · Son atılan', {
                  name:
                    game.seats.find((seat) => seat.seat === index)?.name ??
                    t('Koltuk {number}', { number: index + 1 }),
                })}
              </small>
              {stack[0] ? <OkeyTileView tile={stack[0]} /> : <span>—</span>}
            </div>
          ))}
        </div>
      </section>
      {game.status === 'finished' && <GameResults game={game} result={view} />}{' '}
      {own && game.status === 'playing' && (
        <>
          <section className="rx-rack">
            <header>
              <strong>{t('ELİN · {count} taş', { count: tiles.length })}</strong>
              <div>
                <button className="text-button" onClick={() => setSorted((value) => !value)}>
                  {sorted ? t('Diz · Renk') : t('Diz · Dağıtım')}
                </button>
                <TurnClock timer={timer} />
              </div>
            </header>
            <div className="rx-wood-rack">
              {display.map((tile) => (
                <OkeyTileView
                  key={tile.id}
                  tile={tile}
                  selected={selected.includes(tile.id) || used.includes(tile.id)}
                  disabled={stage !== 'discard' || used.includes(tile.id) || !can('discard')}
                  onClick={() => toggle(tile.id)}
                />
              ))}
            </div>
          </section>
          {stage === 'discard' && (
            <section className="rx-meld-editor">
              <header>
                <h3>{opened ? t('Taş işle veya yeni grup aç') : t('Açılış hazırla')}</h3>
                <div>
                  <button
                    className={!pairs ? 'selected' : ''}
                    disabled={!!opened && opened !== 'runs'}
                    onClick={() => {
                      setPairs(false);
                      setGroups([]);
                      setSelected([]);
                    }}
                  >
                    {t('Seri')}
                  </button>
                  <button
                    className={pairs ? 'selected' : ''}
                    disabled={!!opened && opened !== 'pairs'}
                    onClick={() => {
                      setPairs(true);
                      setGroups([]);
                      setSelected([]);
                    }}
                  >
                    {t('Çift')}
                  </button>
                </div>
              </header>
              <div className="rx-draft-groups">
                {grouped.map((group, index) => (
                  <article key={index}>
                    {group.map((tile) => (
                      <OkeyTileView small key={tile.id} tile={tile} />
                    ))}
                    <button
                      aria-label={t('Grup {number} kaldır', { number: index + 1 })}
                      onClick={() => setGroups((values) => values.filter((_, i) => i !== index))}
                    >
                      <X size={14} />
                    </button>
                  </article>
                ))}
              </div>
              <footer>
                <button
                  className="button secondary"
                  disabled={
                    !can(pairs ? 'open-pairs' : 'open') ||
                    selected.length < (pairs ? 2 : 3) ||
                    (pairs && selected.length !== 2) ||
                    selected.some((id) => used.includes(id))
                  }
                  onClick={() => {
                    setGroups((values) => [...values, selected]);
                    setSelected([]);
                  }}
                >
                  {pairs ? t('Seçimi çift yap') : t('Seçimi seri yap')}
                </button>
                <span role="status" className={validation && groups.length ? 'invalid' : ''}>
                  {validation ||
                    (pairs
                      ? t('{count} çift', { count: groups.length })
                      : t('{total} puan · Hazır', { total }))}
                </span>
                <button
                  className="button primary"
                  disabled={!can(pairs ? 'open-pairs' : 'open') || !!validation}
                  onClick={commit}
                >
                  {pairs ? t('Çift aç') : t('Seri aç')}
                </button>
              </footer>
              {target !== null && melds[target] && (
                <div className="rx-process">
                  <label>
                    {t('Seri {number}', { number: target + 1 })}
                    <select value={joker} onChange={(event) => setJoker(event.target.value)}>
                      <option value="">{t('Uçtan işle')}</option>
                      {melds[target].tiles
                        .filter((tile) => tile.joker)
                        .map((tile) => (
                          <option key={tile.id} value={tile.id}>
                            {t('Okeyi değiştir · {number}', { number: tile.value })}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className="button secondary"
                    disabled={
                      !can('process') ||
                      !selected.length ||
                      (selected.length >= tiles.length && !joker) ||
                      (!!joker && selected.length !== 1)
                    }
                    onClick={() =>
                      void action('process', {
                        amount: target,
                        tileIds: selected,
                        ...(joker ? { cardId: joker } : {}),
                      }).then((ok) => {
                        if (ok) {
                          setSelected([]);
                          setJoker('');
                        }
                      })
                    }
                  >
                    {t('Seçili taşları işle')}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setTarget(null);
                      setJoker('');
                    }}
                  >
                    {t('Vazgeç')}
                  </button>
                </div>
              )}
            </section>
          )}
          <div className="rg-hand-strip">
            <div>
              <h3>
                {own.seat === game.turn
                  ? stage === 'draw'
                    ? t('Taş çek')
                    : t('Taş at')
                  : t('Oyuncu bekleniyor')}
              </h3>
              <p>
                {opened
                  ? opened === 'pairs'
                    ? t('Çift açtın')
                    : t('Seri açtın')
                  : t('Henüz açmadın')}
              </p>
            </div>
            <div className="rg-actions">
              {stage === 'draw' ? (
                <>
                  <button
                    className="button secondary"
                    disabled={!can('draw') || !previous}
                    onClick={() => void action('draw', { cardId: 'discard' })}
                  >
                    {t('Önceki taşı al')}
                  </button>
                  <button
                    className="button primary"
                    disabled={!can('draw')}
                    onClick={() => void action('draw')}
                  >
                    {t('Kapalı taş çek')}
                  </button>
                </>
              ) : (
                <>
                  {stage === 'discard' && can('draw') && (
                    <button className="button secondary" onClick={() => void action('draw')}>
                      {t('Aldığın taşı geri bırak ve kapalı çek')}
                    </button>
                  )}
                  <button
                    className="button primary"
                    disabled={
                      !can('discard') || selected.length !== 1 || used.includes(selected[0])
                    }
                    onClick={() =>
                      void action('discard', { cardId: selected[0] }).then((ok) => {
                        if (ok) setSelected([]);
                      })
                    }
                  >
                    {tiles.length === 1 ? t('Bitir · Son taşı at') : t('Seçili taşı at')}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
function pokerCategory(category: string) {
  return (
    (
      {
        'high-card': t('Yüksek kart'),
        'one-pair': t('Bir çift'),
        'two-pair': t('İki çift'),
        'three-of-a-kind': t('Üçlü'),
        straight: t('Kent'),
        flush: t('Renk'),
        'full-house': 'Full house',
        'four-of-a-kind': t('Kare'),
        'straight-flush': t('Sıralı renk'),
      } as Record<string, string>
    )[category] ?? t('El')
  );
}
function validHoldemRules(value: HoldemTableRules) {
  return (
    value.name.trim().length > 0 &&
    value.name.trim().length <= 32 &&
    Number.isInteger(value.capacity) &&
    value.capacity >= 2 &&
    value.capacity <= 9 &&
    [value.smallBlind, value.bigBlind, value.minBuyIn, value.maxBuyIn, value.initialChips].every(
      (number) => Number.isInteger(number) && number > 0 && number <= 1000000,
    ) &&
    value.smallBlind <= 100000 &&
    value.bigBlind <= 100000 &&
    value.smallBlind <= value.bigBlind &&
    value.minBuyIn >= value.bigBlind &&
    value.maxBuyIn >= value.minBuyIn &&
    value.initialChips >= value.minBuyIn &&
    value.initialChips <= value.maxBuyIn
  );
}
function HoldemRulesForm({
  value,
  onChange,
}: {
  value: HoldemTableRules;
  onChange(value: HoldemTableRules): void;
}) {
  return (
    <div className="rg-holdem-form">
      <label className="wide">
        {t('Masa adı')}
        <input
          autoFocus
          maxLength={32}
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </label>
      {(
        [
          ['capacity', t('Koltuk sayısı'), 2, 9],
          ['smallBlind', 'Small blind', 1, 100000],
          ['bigBlind', 'Big blind', 1, 100000],
          ['minBuyIn', t('Minimum giriş'), 1, 1000000],
          ['maxBuyIn', t('Maksimum giriş'), 1, 1000000],
          ['initialChips', t('Başlangıç fişi'), 1, 1000000],
        ] as const
      ).map(([key, label, min, max]) => (
        <label key={key}>
          {label}
          <input
            type="number"
            min={min}
            max={max}
            value={value[key]}
            onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })}
          />
        </label>
      ))}
      <label className="wide">
        <input
          type="checkbox"
          checked={value.spectatorsAllowed}
          onChange={(event) => onChange({ ...value, spectatorsAllowed: event.target.checked })}
        />{' '}
        {t('İzleyici kabul et')}
      </label>
      {!validHoldemRules(value) && (
        <p className="wide" role="status">
          {t('Blind ve giriş aralıklarını kontrol et. Başlangıç fişi giriş aralığında olmalı.')}
        </p>
      )}
    </div>
  );
}
function ReferenceCreateGame({
  kind,
  variant,
  setVariant,
  folding,
  setFolding,
  teams,
  setTeams,
  participants,
  busy,
  disabled,
  reason,
  error,
  consent,
  onCancel,
  onSubmit,
}: {
  kind: 'batak' | '101';
  variant: 'ihaleli' | 'esli' | 'koz-maca' | 'gommeli';
  setVariant(value: 'ihaleli' | 'esli' | 'koz-maca' | 'gommeli'): void;
  folding: boolean;
  setFolding(value: boolean): void;
  teams: boolean;
  setTeams(value: boolean): void;
  participants: { userId: string; displayName: string }[];
  busy: boolean;
  disabled: boolean;
  reason: string;
  error: string;
  /** Explicit "end the open activity and set up this table" choice. */
  consent?: { label: string; checked: boolean; onChange(checked: boolean): void };
  onCancel(): void;
  onSubmit(): void;
}) {
  const fixtureMetadata = useGameFixtureMetadata();
  const [rulesOpen, setRulesOpen] = useState(false);
  useEffect(() => {
    if (fixtureMetadata) setRulesOpen(fixtureMetadata.ui.modal === 'rules');
  }, [fixtureMetadata]);
  const count = kind === 'batak' && variant === 'gommeli' ? 3 : 4;
  const modes = [
    ['ihaleli', t('İhaleli'), '♣', t('4 oyuncu · Tekli')],
    ['esli', t('Eşli'), '♠', t('4 oyuncu · 2 + 2')],
    ['koz-maca', t('Koz Maça'), '♠', t('4 oyuncu · Sabit koz')],
    ['gommeli', t('Gömmeli'), '♦', t('3 oyuncu · 4 kart gömme')],
  ] as const;
  return (
    <div className="rg-page rx-create">
      <header className="rg-heading">
        <div>
          <h1>{kind === 'batak' ? t('Hangi Batak?') : t('101 Okey masası')}</h1>
          <p>{kind === 'batak' ? t('Batak türünü seç.') : t('Masa kurallarını seç.')}</p>
        </div>
        <div>
          <button onClick={() => setRulesOpen(true)}>
            <ShieldCheck size={16} />
            {t('Masa kuralları')}
          </button>
          <button onClick={onCancel}>
            <X size={16} />
            {t('Vazgeç')}
          </button>
        </div>
      </header>
      {kind === 'batak' ? (
        <div className="rx-create-options">
          {modes.map(([id, label, symbol, detail]) => (
            <button
              key={id}
              className={variant === id ? 'selected' : ''}
              onClick={() => setVariant(id)}
            >
              <span>{symbol}</span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="rx-create-options two">
            {([false, true] as const).map((value) => (
              <button
                className={folding === value ? 'selected' : ''}
                key={String(value)}
                onClick={() => setFolding(value)}
              >
                <strong>{value ? t('Katlamalı') : t('Katlamasız')}</strong>
                <small>{value ? t('Önceki açılış toplamını geç') : t('Açılış en az 101')}</small>
              </button>
            ))}
          </div>
          <div className="rx-create-options two">
            {([false, true] as const).map((value) => (
              <button
                className={teams === value ? 'selected' : ''}
                key={String(value)}
                onClick={() => setTeams(value)}
              >
                <strong>{value ? t('Eşli') : t('Tekli')}</strong>
                <small>{value ? t('2 + 2 oyuncu') : t('4 oyuncu')}</small>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="rx-create-body">
        <section>
          <h3>{t('Odadaki kişiler')}</h3>
          {participants.length ? (
            participants.map((person) => (
              <div className="rx-create-participant" key={person.userId}>
                <Avatar name={person.displayName} />
                <strong>{person.displayName}</strong>
              </div>
            ))
          ) : (
            <p>{t('Katılımcı bilgisi henüz alınmadı.')}</p>
          )}
          <p className="rg-footer-note">{t('Masa kurulduktan sonra oyuncular koltuk seçer.')}</p>
        </section>
        <aside className="rg-rules">
          <h3>{t('Masa özeti')}</h3>
          <div>
            <span>{t('Oyun')}</span>
            <strong>{names[kind]}</strong>
          </div>
          <div>
            <span>{t('Oyuncu')}</span>
            <strong>{count}</strong>
          </div>
          {kind === 'batak' ? (
            <>
              <div>
                <span>{t('Tür')}</span>
                <strong>{modes.find((mode) => mode[0] === variant)?.[1]}</strong>
              </div>
              <div>
                <span>{t('Akış')}</span>
                <strong>
                  {variant === 'gommeli'
                    ? t('İhale · Koz · Gömme · Oyun')
                    : variant === 'koz-maca'
                      ? t('Tahmin · Oyun')
                      : t('İhale · Koz · Oyun')}
                </strong>
              </div>
            </>
          ) : (
            <>
              <div>
                <span>{t('Açılış')}</span>
                <strong>{t('101 · 5 çift')}</strong>
              </div>
              <div>
                <span>{t('Katlamalı')}</span>
                <strong>{folding ? t('Açık') : t('Kapalı')}</strong>
              </div>
              <div>
                <span>{t('Eşli')}</span>
                <strong>{teams ? t('Açık') : t('Kapalı')}</strong>
              </div>
            </>
          )}
          <div>
            <span>{t('Puan')}</span>
            <strong>{t('Yalnızca sanal')}</strong>
          </div>
        </aside>
      </div>
      {reason && (
        <div className="rg-banner" role="status">
          {reason}
        </div>
      )}
      {consent && (
        <label className="rg-replace-consent">
          <input
            type="checkbox"
            checked={consent.checked}
            disabled={busy}
            onChange={(event) => consent.onChange(event.target.checked)}
          />
          <span>{consent.label}</span>
        </label>
      )}
      {error && (
        <div className="rg-banner error" role="alert">
          {error}
        </div>
      )}
      <footer>
        <button className="button secondary" onClick={onCancel}>
          {t('Vazgeç')}
        </button>
        <button
          className="button primary"
          disabled={busy || disabled}
          title={reason || undefined}
          onClick={onSubmit}
        >
          {t('Masayı kur')}
        </button>
      </footer>
      {rulesOpen && (
        <Modal title={t('Masa kuralları')} className="rg-modal" onClose={() => setRulesOpen(false)}>
          <div className="rg-modal-body rg-rules">
            {(kind === 'batak'
              ? [
                  [t('Oyuncu'), String(count)],
                  [
                    t('İhale'),
                    variant === 'koz-maca'
                      ? t('Her oyuncu 1–13 tahmin verir')
                      : variant === 'esli' || variant === 'gommeli'
                        ? t('En az 8')
                        : t('En az 5'),
                  ],
                  [t('Renge uyma'), t('Zorunlu · Mümkünse yükselt')],
                  [t('Gömmeli'), t('Koz seçimi sonrası 4 kart gömülür')],
                  [t('Puan'), t('Sunucunun mevcut Batak puan profili')],
                ]
              : [
                  [t('Oyuncu'), t('4 · Eşler karşılıklı')],
                  [t('Dağıtım'), t('Başlayan 22, diğerleri 21 taş')],
                  [
                    t('Açılış'),
                    folding ? t('Son açıştan en az 1 fazla · İlk 101') : t('En az 101'),
                  ],
                  [t('Çift'), t('En az 5 çift')],
                  [t('Açma türü'), t('Seri ve çift aynı oyuncuda karıştırılmaz')],
                  ['Okey', t('Göstergenin bir üstü')],
                  [t('Bitirme'), t('Son taş atılır')],
                  [t('Puan'), t('Kazanan −101 · Açmayan 202 · Okey bitişi iki kat')],
                ]
            ).map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Recovery is projected only for the requesting user's real, nonpermanent seat. */
function GameRecovery({
  activity,
  game,
}: {
  activity: ReturnType<typeof useActivityRoom>;
  game: GamePublicState;
}) {
  const fixtureMetadata = useGameFixtureMetadata(),
    community = useCommunity(),
    own = game.seats.find((seat) => seat.userId === community.user?.id),
    recovery = game.view.ownRecovery;
  const [now, setNow] = useState(Date.now()),
    [open, setOpen] = useState(false),
    [pending, setPending] = useState(false),
    [dismissed, setDismissed] = useState<string[]>([]);
  const lock = useRef(false);
  const fixture = import.meta.env.DEV && new URLSearchParams(location.search).has('fixture'),
    connected = activity.status === 'connected';
  useEffect(() => {
    if (!recovery?.takeoverAt || recovery.takeover) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    setNow(Date.now());
    return () => clearInterval(timer);
  }, [recovery?.takeoverAt, recovery?.takeover]);
  useEffect(() => {
    setOpen(!!own && !connected);
  }, [connected, own?.userId]);
  useEffect(() => {
    if (fixtureMetadata?.ui.modal === 'recovery') setOpen(true);
  }, [fixtureMetadata]);
  useEffect(() => {
    setDismissed([]);
  }, [community.user?.id, activity.room?.primary?.startedAt]);
  const event = [...(recovery?.events ?? [])]
    .filter((item) => !dismissed.includes(item.id))
    .sort((a, b) => b.at - a.at)[0];
  const current =
    !!recovery &&
    (recovery.disconnectedAt !== null || recovery.pendingReturn || recovery.takeover || !connected);
  if (!own || !recovery || (!current && !event)) return null;
  const seconds =
    recovery.takeoverAt !== null
      ? Math.max(0, Math.ceil((recovery.takeoverAt - now - activity.serverOffsetMs) / 1000))
      : null;
  const returning = recovery.pendingReturn,
    eventTitle =
      event?.type === 'turn-timeout'
        ? t('Hamle süresi doldu')
        : event?.type === 'control-returned'
          ? t('Kontrol sana döndü')
          : event?.type === 'return-requested'
            ? t('Masaya dönüş istendi')
            : t('Bot devraldı'),
    title =
      !current && event
        ? eventTitle
        : returning
          ? t('Masaya dönüş bekleniyor')
          : recovery.takeover
            ? t('Bot koltuğunu devraldı')
            : connected
              ? t('Koltuğuna geri dön')
              : t('Bağlantın kesildi');
  const reason = fixture
    ? t('Yerel örnekte gerçek oyun işlemi kapalı')
    : !connected
      ? t('Önce oda bağlantısı kurulmalı')
      : '';
  const reclaim = async () => {
    if (reason || activity.busy || lock.current) return;
    lock.current = true;
    setPending(true);
    try {
      await activity.send({ type: 'game.sit', seat: own.seat });
      setOpen(false);
    } catch {
      /* The activity hook retains the actual native error. */
    } finally {
      lock.current = false;
      setPending(false);
    }
  };
  const eventText =
    event?.type === 'turn-timeout'
      ? event.action === 'fold'
        ? event.toCall !== undefined
          ? t('Sunucu eli bıraktı; karşılanacak bahis {amount} fişti.', { amount: event.toCall })
          : t('Sunucu eli bıraktı.')
        : event.action === 'check'
          ? t('Karşılanacak bahis yoktu; sunucu kontrol etti.')
          : t('Sunucu süre sonunda {action} uyguladı.', {
              action: event.action ?? t('izinli hamleyi'),
            })
      : event?.type === 'control-returned'
        ? t('Sunucu koltuğunun kontrolünü güvenli sırada sana döndürdü.')
        : event?.type === 'return-requested'
          ? t('Dönüş isteğin sunucuda kaydedildi.')
          : t('Sunucu bağlantı kesintisinden sonra bot kontrolünü başlattı.');
  const body = (
    <>
      <div className="rh-recovery-callout">
        <Bot size={24} />
        <div>
          <strong>{title}</strong>
          <p>
            {!current && event
              ? eventText
              : returning
                ? t('Bot mevcut hamleyi tamamlar; kontrol güvenli sırada sana döner.')
                : recovery.takeover
                  ? t('Oyun botla devam ediyor. Koltuğuna dönebilirsin.')
                  : seconds !== null
                    ? t(
                        '{seconds} saniye sonra bot devralabilir. Koltuğuna daha sonra da dönebilirsin.',
                        { seconds },
                      )
                    : t('Masadaki yerin korunuyor.')}
          </p>
        </div>
        {!recovery.takeover && seconds !== null && <b>{seconds}s</b>}
      </div>
      <div className="rh-recovery-steps">
        <span>{t('Bağlantı kesildi')}</span>
        <span>{t('Bot devralır')}</span>
        <span>{t('Güvenli sırada geri dön')}</span>
      </div>
      {event && (
        <div className="rh-recovery-record">
          <small>
            {t('El {hand}', { hand: event.hand })} · {new Date(event.at).toLocaleString(locale)}
          </small>
          <p>{eventText}</p>
        </div>
      )}
      {activity.error && (
        <p role="alert" className="rh-error">
          {activity.error}
        </p>
      )}
    </>
  );
  return (
    <>
      <div className="rg-banner">
        <Bot size={17} />
        <span>
          {title}
          {current && !recovery.takeover && seconds !== null
            ? ` · ${seconds}s`
            : event
              ? ` · ${t('El {hand}', { hand: event.hand })}`
              : ''}
        </span>
        <button onClick={() => setOpen(true)}>{t('Ayrıntılar')}</button>
        {current && !returning && (
          <button
            disabled={!!reason || pending || activity.busy}
            title={reason || undefined}
            onClick={() => void reclaim()}
          >
            {t('Masaya geri dön')}
          </button>
        )}
        {!current && event && (
          <button
            aria-label={t('Kayıt bildirimini kapat')}
            onClick={() => setDismissed((values) => [...values, event.id])}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open && (
        <Modal title={title} className="rg-modal rh-recovery" onClose={() => setOpen(false)}>
          <div className="rg-modal-body">{body}</div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => setOpen(false)}>
              {t('Masayı göster')}
            </button>
            {!current ? null : !connected ? (
              <button className="button primary" onClick={() => void activity.refresh()}>
                {t('Yeniden bağlan')}
              </button>
            ) : (
              <button
                className="button primary"
                disabled={!!reason || pending || activity.busy || returning}
                title={reason || undefined}
                onClick={() => void reclaim()}
              >
                {returning ? t('Güvenli sıra bekleniyor') : t('Masaya geri dön')}
              </button>
            )}
          </footer>
        </Modal>
      )}
    </>
  );
}

type HistoryTable = {
  kind: GameKind;
  history: GamePublicState['history'];
  statistics: Record<string, unknown>;
  seats: GamePublicState['seats'];
  label: string;
};
function ReferenceGameHistory({
  activity,
  game,
}: {
  activity: ReturnType<typeof useActivityRoom>;
  game: GamePublicState | null;
}) {
  const fixtureMetadata = useGameFixtureMetadata(),
    navigate = useNavigate(),
    community = useCommunity();
  const [filter, setFilter] = useState<'all' | GameKind>('all'),
    [detail, setDetail] = useState<{
      table: HistoryTable;
      hand: GamePublicState['history'][number];
    } | null>(null);
  const access =
    !!game &&
    (game.seats.some((seat) => seat.userId === community.user?.id) || game.view.watching === true);
  const tables: HistoryTable[] =
    access && game
      ? [
          {
            kind: game.kind,
            history: game.history,
            statistics: object(game.view.statistics),
            seats: game.seats,
            label: game.view.tableName ?? names[game.kind],
          },
          ...array<Record<string, unknown>>(game.view.previousTables)
            .filter((table) => ['holdem', 'blackjack', 'batak', '101'].includes(String(table.kind)))
            .map((table) => ({
              kind: table.kind as GameKind,
              history: array<GamePublicState['history'][number]>(table.history),
              statistics: object(table.statistics),
              seats: [],
              label: names[table.kind as GameKind],
            })),
        ]
      : [];
  const filtered = tables.filter((table) => filter === 'all' || table.kind === filter),
    rows = filtered
      .flatMap((table, index) =>
        table.history.map((hand) => ({
          table,
          hand,
          key: `${index}:${hand.hand}:${hand.endedAt}`,
        })),
      )
      .sort((a, b) => b.hand.endedAt - a.hand.endedAt);
  const stats = filtered.map((table) => object(table.statistics[community.user?.id ?? ''])),
    hands = stats.reduce((sum, item) => sum + Number(item.hands ?? 0), 0),
    wins = stats.reduce((sum, item) => sum + Number(item.wins ?? 0), 0);

  const ownResult = (
    table: HistoryTable,
    result: Record<string, unknown>,
    entry: GamePublicState['history'][number],
  ) => {
    const player = array<Record<string, unknown>>(result.players).find(
      (item) => item.userId === community.user?.id,
    );
    if (player && ['holdem', 'blackjack'].includes(table.kind) && typeof player.net === 'number')
      return t('{net} fiş', { net: `${player.net > 0 ? '+' : ''}${player.net}` });
    if (table.kind === 'holdem') {
      const paid = object(result.payouts)[community.user?.id ?? ''];
      return paid !== undefined
        ? t('{amount} fiş ödendi', { amount: Number(paid) })
        : t('Ödeme yok');
    }
    if (table.kind === 'blackjack') {
      const own = array<Record<string, unknown>>(result.results).filter(
        (item) => item.userId === community.user?.id,
      );
      return own.length
        ? own
            .map(
              (item) =>
                (
                  ({
                    win: t('Kazandı'),
                    lose: t('Kaybetti'),
                    push: t('Berabere'),
                    blackjack: 'Blackjack',
                  }) as Record<string, string>
                )[String(item.outcome)] ?? t('Sonuç'),
            )
            .join(' · ')
        : '—';
    }
    const own = entry.seats?.find((seat) => seat.userId === community.user?.id);
    const scores = array<number>(result.scores);
    return own && scores[own.position] !== undefined
      ? t('{score} puan', { score: scores[own.position] })
      : t('Koltuk puanları');
  };
  useEffect(() => setDetail(null), [activity.room?.roomId, community.user?.id]);
  useEffect(() => {
    const kind = fixtureMetadata?.ui.historyKind;
    if (!kind) return;
    const table = tables.find((item) => item.kind === kind),
      hand = table?.history.at(-1);
    if (table && hand) setDetail({ table, hand });
  }, [fixtureMetadata, game]);
  return (
    <div className="rg-page rh-history">
      <header className="rg-heading">
        <div>
          <h1>{t('Masa geçmişi')}</h1>
          <p>{t('Tamamlanan eller ve sunucuda kaydedilen sonuçlar.')}</p>
        </div>
        <div>
          <button onClick={() => navigate('/games')}>
            <ArrowRight size={16} />
            {t('Oyun alanı')}
          </button>
          <IconButton label={t('Geçmişi yenile')} onClick={() => void activity.refresh()}>
            <RefreshCw size={17} />
          </IconButton>
        </div>
      </header>
      <div className="rh-stats">
        {[
          [t('Oynanan el'), String(hands)],
          [t('Kazanılan el'), String(wins)],
          [t('Kazanma oranı'), hands ? `${Math.round((wins / hands) * 100)}%` : '—'],
          [t('Geçmiş kaydı'), String(rows.length)],
        ].map(([label, value]) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <section className="rh-history-panel">
        <header>
          <h3>{t('Tamamlanan eller')}</h3>
          <label>
            {t('Oyun')}
            <select
              aria-label={t('Geçmiş oyun filtresi')}
              value={filter}
              onChange={(event) => setFilter(event.target.value as typeof filter)}
            >
              <option value="all">{t('Tüm oyunlar')}</option>
              {Object.entries(names).map(([kind, name]) => (
                <option value={kind} key={kind}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </header>
        {activity.status === 'loading' ? (
          <div className="rh-empty">
            <RefreshCw size={28} />
            <h3>{t('Geçmiş getiriliyor…')}</h3>
          </div>
        ) : activity.error ? (
          <div className="rh-empty rh-error">
            <h3>{t('Geçmiş alınamadı')}</h3>
            <p>{activity.error}</p>
            <button className="button secondary" onClick={() => void activity.refresh()}>
              {t('Yeniden dene')}
            </button>
          </div>
        ) : !access ? (
          <div className="rh-empty">
            <History size={30} />
            <h3>{game ? t('Önce masaya katıl.') : t('Açık masa yok.')}</h3>
            <p>
              {game
                ? t('Geçmiş için koltuk veya izleyici erişimi gerekir.')
                : t('Arşivli masa erişimi bu bağlantıda henüz uygulanmadı.')}
            </p>
            <button className="button secondary" onClick={() => navigate('/games')}>
              {t('Oyun alanına dön')}
            </button>
          </div>
        ) : rows.length ? (
          <table className="rh-history-table">
            <thead>
              <tr>
                <th>{t('Masa')}</th>
                <th>{t('El')}</th>
                <th>{t('Tarih')}</th>
                <th>{t('Sonucun')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ table, hand, key }) => (
                <tr key={key}>
                  <td>
                    <strong>{hand.tableName ?? names[table.kind]}</strong>
                    <small>{names[table.kind]}</small>
                  </td>
                  <td>{hand.hand}</td>
                  <td>{new Date(hand.endedAt).toLocaleString(locale)}</td>
                  <td>{ownResult(table, hand.result, hand)}</td>
                  <td>
                    <button onClick={() => setDetail({ table, hand })}>
                      {t('Ayrıntılar')}
                      <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="rh-empty">
            <History size={30} />
            <h3>{t('Henüz tamamlanan el yok.')}</h3>
            <button className="button secondary" onClick={() => navigate('/games')}>
              {t('Masalara dön')}
            </button>
          </div>
        )}
      </section>
      <p className="rh-history-note">
        {t('Puan ve sanal fiş farklıdır; toplam kazanç birleştirilmez.')}
      </p>
      {detail && (
        <Modal
          title={t('{game} · El {hand}', {
            game: names[detail.table.kind],
            hand: detail.hand.hand,
          })}
          className="rg-modal rh-detail"
          onClose={() => setDetail(null)}
        >
          <div className="rg-modal-body">
            <p>{new Date(detail.hand.endedAt).toLocaleString(locale)}</p>
            <HistoryDetails kind={detail.table.kind} entry={detail.hand} />
          </div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => setDetail(null)}>
              {t('Geçmişe dön')}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}

function useGameFixtureMetadata() {
  const [metadata, setMetadata] = useState<GamesFixtureMetadata | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(location.search),
      id = params.get('fixture');
    if (!id || !/^S(4\d|5[0-4])$/.test(id)) return;
    let alive = true;
    void import('./dev/games-fixture').then((module) => {
      const value = module.getGamesFixtureMetadata(id, params.get('variant') || 'default');
      if (alive) setMetadata(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return metadata;
}
function HistoryDetails({
  kind,
  entry,
}: {
  kind: GameKind;
  entry: GamePublicState['history'][number];
}) {
  const result = entry.result,
    historical = entry.seats ?? [],
    name = (id: string) => historical.find((seat) => seat.userId === id)?.name ?? t('Katılımcı');
  const players = array<Record<string, unknown>>(result.players),
    scores = array<number>(result.scores),
    contract = object(result.contract);
  if (kind === 'holdem')
    return (
      <>
        <div className="rh-board-cards">
          {array<Card>(result.board).map((card) => (
            <PlayingCard key={card.id} card={card} />
          ))}
        </div>
        <div className="rh-detail-rows">
          {players.length
            ? players.map((player) => (
                <div key={String(player.userId)}>
                  <span>{name(String(player.userId))}</span>
                  <strong>
                    {Number(player.net) > 0 ? '+' : ''}
                    {t('{amount} fiş', { amount: Number(player.net) })}
                  </strong>
                </div>
              ))
            : Object.entries(object(result.payouts)).map(([id, amount]) => (
                <div key={id}>
                  <span>{name(id)}</span>
                  <strong>{t('{amount} fiş ödendi', { amount: Number(amount) })}</strong>
                </div>
              ))}
        </div>
        {Object.entries(object(result.revealedCards)).map(([id, cards]) => (
          <div className="rh-revealed-hand" key={id}>
            <span>{name(id)}</span>
            <div>
              {array<Card>(cards).map((card) => (
                <PlayingCard key={card.id} card={card} />
              ))}
            </div>
            <small>
              {pokerCategory(String(object(object(result.showdown)[id]).category ?? ''))}
            </small>
          </div>
        ))}
        <p>
          {result.settlementReason === 'uncontested'
            ? t('Diğer oyuncular eli bıraktı.')
            : t('Showdown sonucu')}
        </p>
        {!result.revealedCards && <p>{t('Bu eski kayıtta açılmış kartlar bulunmuyor.')}</p>}
        <p>{t('Katlanan oyuncuların gizli kartları paylaşılmaz.')}</p>
      </>
    );
  if (kind === 'blackjack')
    return (
      <>
        {array<Card>(result.dealer).length > 0 && (
          <div className="rh-dealer-history">
            <small>{t('Krupiye · {total}', { total: Number(result.dealerTotal) })}</small>
            <div className="rh-board-cards">
              {array<Card>(result.dealer).map((card) => (
                <PlayingCard key={card.id} card={card} />
              ))}
            </div>
          </div>
        )}
        {players.length ? (
          players.map((player) => (
            <section className="rh-blackjack-history" key={String(player.userId)}>
              <h3>
                {name(String(player.userId))}{' '}
                <span>
                  {Number(player.net) > 0 ? '+' : ''}
                  {t('{amount} fiş', { amount: Number(player.net) })}
                </span>
              </h3>
              {array<Record<string, unknown>>(player.hands).map((hand) => (
                <div className="rh-history-hand" key={Number(hand.hand)}>
                  <div>
                    {array<Card>(hand.cards).map((card) => (
                      <PlayingCard key={card.id} card={card} />
                    ))}
                  </div>
                  <div>
                    <strong>
                      {t('El {hand} · {total}', {
                        hand: Number(hand.hand) + 1,
                        total: Number(hand.total),
                      })}
                    </strong>
                    <small>
                      {t('Bahis {amount} ·', { amount: Number(hand.bet) })}{' '}
                      {(
                        {
                          win: t('Kazandı'),
                          lose: t('Kaybetti'),
                          push: t('Berabere'),
                          blackjack: 'Blackjack',
                        } as Record<string, string>
                      )[String(hand.outcome)] ?? String(hand.outcome)}
                      {hand.split ? ' · Split' : ''}
                    </small>
                  </div>
                </div>
              ))}
            </section>
          ))
        ) : (
          <>
            <div className="rh-detail-rows">
              {array<Record<string, unknown>>(result.results).map((item, index) => (
                <div key={index}>
                  <span>
                    {t('{name} · El {hand}', {
                      name: name(String(item.userId)),
                      hand: Number(item.hand) + 1,
                    })}
                  </span>
                  <strong>
                    {t('{outcome} · {amount} fiş geri aldı', {
                      outcome: String(item.outcome),
                      amount: Number(item.returned),
                    })}
                  </strong>
                </div>
              ))}
            </div>
            <p>{t('Bu eski kayıtta kartlar ve başlangıç bahsi bulunmuyor.')}</p>
          </>
        )}
      </>
    );
  return (
    <>
      {kind === 'batak' && Object.keys(contract).length > 0 && (
        <div className="rh-history-rules">
          <span>
            {t('İhale {bid} ·', { bid: Number(contract.bid) })}{' '}
            {historical.find((seat) => seat.position === Number(contract.bidder))?.name ??
              t('Katılımcı')}
          </span>
          <span>{t('Koz {trump}', { trump: suits[String(contract.trump)] ?? '—' })}</span>
          <span>{String(result.variant ?? 'Batak')}</span>
        </div>
      )}
      {kind === '101' && result.lastDiscard && (
        <div className="rh-last-discard">
          <span>{t('Son atılan taş')}</span>
          <OkeyTileView tile={result.lastDiscard as Tile} small />
        </div>
      )}
      <div className="rh-detail-rows">
        {scores.map((score, position) => {
          const seat = historical.find((seat) => seat.position === position);
          return (
            <div key={position}>
              <span>
                {seat?.name ?? t('Koltuk sırası {number}', { number: position + 1 })}
                {kind === 'batak' && array<number>(result.tricks)[position] !== undefined
                  ? ` · ${t('{count} el', { count: array<number>(result.tricks)[position] ?? 0 })}`
                  : ''}
                {kind === '101' && typeof result.winner === 'number' && result.winner === position
                  ? t(' · Bitirdi')
                  : ''}
              </span>
              <strong>{t('{score} puan', { score })}</strong>
            </div>
          );
        })}
      </div>
      {kind === 'batak' && array<number[]>(result.teams).length > 0 && (
        <div className="rh-history-teams">
          {array<number[]>(result.teams).map((team, index) => (
            <article key={index}>
              <small>{t('Takım {number}', { number: index + 1 })}</small>
              <strong>
                {team
                  .map(
                    (position) =>
                      historical.find((seat) => seat.position === position)?.name ?? t('Katılımcı'),
                  )
                  .join(' + ')}
              </strong>
              <span>
                {t('{score} puan', {
                  score: team.reduce((sum, position) => sum + (scores[position] ?? 0), 0),
                })}
              </span>
            </article>
          ))}
        </div>
      )}
      {!entry.seats && <p>{t('Bu eski kayıtta oyuncu eşlemesi bulunmuyor.')}</p>}
      <p>
        {kind === '101'
          ? t('İlk açılış puanı ve son işlenen taş bu kayıtta bulunmuyor.')
          : t('El sonuçları sunucuda kaydedilen puanları gösterir.')}
      </p>
    </>
  );
}
