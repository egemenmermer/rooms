import { Kiraathane } from './Kiraathane';
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
import { tr, uiError } from './i18n';
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
import { useCurrentRoom } from './Agent';
import { useCommunity } from './community';
import type {
  ActivityCommand,
  GamePublicState,
  HoldemTableRules,
} from '../../../packages/activity-protocol/src';
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
const names: Record<GameKind, string> = {
  holdem: 'Texas Hold’em',
  blackjack: 'Blackjack',
  batak: 'Batak',
  '101': '101 Okey',
};
const suits: Record<string, string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
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
      aria-label={card ? `${card.rank} ${suits[card.suit] ?? card.suit}` : tr('Kapal\u0131 kart')}
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
            ? 'Masa açma yetkin yok'
            : activity.room?.primary && !game
              ? 'Önce açık etkinliği bitirin'
              : ''
        }
        onCreate={setCreate}
        onOpen={() => navigate('/games?tab=table')}
        onChat={() => navigate('/voice')}
        onHistory={() => navigate('/games?tab=history')}
        onRetry={() => void activity.refresh()}
      />
    );
  if (game && game.status !== 'waiting' && game.kind !== 'holdem')
    return (
      <>
        <button className="coffeehouse-return" onClick={() => navigate('/games')}>
          ← Kıraathaneye dön
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
        ← Kıraathaneye dön
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
  const fixtureReason = 'Yerel görsel örnekte gerçek oyun işlemi kapalı';
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
    [inviteCode, setInviteCode] = useState(''),
    [inviteBusy, setInviteBusy] = useState(false),
    [inviteError, setInviteError] = useState(''),
    [inviteCopied, setInviteCopied] = useState(false);
  const inviteRequest = useRef(0);
  const [replaceConsent, setReplaceConsent] =
    useState<Extract<ActivityCommand, { type: 'game.create' }>['replacePrimary']>();
  const currentPrimary = activity.room?.primary;
  const ownParticipant = activity.room?.participants.find((person) => person.userId === c.user?.id);
  const canReplace = ownParticipant?.canCreate === true && ownParticipant.canControl;
  const replacementMatches =
    !!replaceConsent &&
    !!currentPrimary &&
    replaceConsent.activity === currentPrimary.activity &&
    replaceConsent.startedAt === currentPrimary.startedAt;
  const createConflict =
    !!currentPrimary && !(create === 'holdem' && canReplace && replacementMatches);
  const closeInvite = () => {
    inviteRequest.current++;
    setInviteOpen(false);
    setInviteBusy(false);
    setInviteCode('');
    setInviteError('');
    setInviteCopied(false);
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
    setInviteCopied(false);
    try {
      const result = await c.createInvite(roomId);
      if (request === inviteRequest.current && scope === commandGeneration.current)
        setInviteCode(result.code);
    } catch (error) {
      if (request === inviteRequest.current && scope === commandGeneration.current)
        setInviteError(uiError(error));
    } finally {
      if (request === inviteRequest.current) setInviteBusy(false);
    }
  };
  const copyInvite = async (link: boolean) => {
    const request = inviteRequest.current,
      scope = commandGeneration.current;
    try {
      await navigator.clipboard.writeText(
        link
          ? `rooms://invite?server=${encodeURIComponent(c.serverUrl)}&code=${encodeURIComponent(inviteCode)}`
          : inviteCode,
      );
      if (request === inviteRequest.current && scope === commandGeneration.current) {
        setInviteCopied(true);
        setInviteError('');
      }
    } catch {
      if (request === inviteRequest.current && scope === commandGeneration.current)
        setInviteError('Panoya erişilemiyor. Kodu seçip kopyala.');
    }
  };
  const selectedSeat = buyIn === null ? null : game?.seats.find((seat) => seat.seat === buyIn);
  const seatReason = selectedSeat
    ? 'Bu koltuk artık dolu. Başka bir koltuk seç.'
    : own
      ? 'Zaten masadasın.'
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
    ? 'Oyunu başlatmak için önce otur'
    : !owner
      ? 'Oyunu yalnızca masa sahibi başlatabilir'
      : !ready
        ? 'Etkinlik bağlantısı bekleniyor'
        : !game ||
            game.seats.length <
              (game.kind === 'holdem' ? 2 : game.kind === 'blackjack' ? 1 : capacity)
          ? 'Başlamak için koltukları doldurun'
          : game.kind === 'holdem' &&
              game.seats.some(
                (seat) => seat.chips < Number(view.rules?.bigBlind ?? view.bigBlind ?? 20),
              )
            ? 'Bir oyuncunun fişi blind için yetersiz'
            : '';
  const roomName = c.channels.find((channel) => channel.id === roomId)?.name ?? 'Oda';
  const title =
    view.tableName ?? activity.room?.primary?.title ?? (game ? names[game.kind] : 'Oyun alanı');
  const seatName = (id: string) => game?.seats.find((seat) => seat.userId === id)?.name ?? 'Oyuncu';
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
    ['Oyun', game ? names[game.kind] : create ? names[create] : '—'],
    ['Koltuk', String(capacity)],
    ...(game?.kind === 'holdem'
      ? [
          [
            'Blind',
            `${nativeRules?.smallBlind ?? '—'} / ${nativeRules?.bigBlind ?? view.bigBlind ?? '—'} sanal fiş`,
          ] as [string, string],
        ]
      : []),
    ...(game?.kind === 'holdem'
      ? ([
          ['Giriş', `${nativeRules?.minBuyIn ?? '—'} – ${nativeRules?.maxBuyIn ?? '—'}`],
          ['İzleyici', nativeRules?.spectatorsAllowed ? 'Açık' : 'Kapalı'],
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
        disabled={fixture || !ready || !!activity.room?.primary}
        reason={
          fixture
            ? fixtureReason
            : !ready
              ? 'Etkinlik bağlantısı gerekli'
              : activity.room?.primary
                ? 'Önce açık etkinliği bitirin'
                : ''
        }
        error={activity.error ?? ''}
        onCancel={() => onCreate(null)}
        onSubmit={() =>
          void send({
            type: 'game.create',
            game: create,
            ...(create === 'batak' ? { variant } : { folding, teams }),
          }).then((ok) => {
            if (ok) onCreate(null);
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
                  ? 'El tamamlandı'
                  : title
                : 'Masa hazır. Sen de gel.'}
            </h1>
            {game && (
              <span>
                {game.seats.length} / {capacity}
              </span>
            )}
            {playing && <span>Kurallar kilitli</span>}
          </div>
          <p>
            {game
              ? `${roomName} · ${names[game.kind]} · Sanal fiş`
              : 'Bir oyun seç, arkadaşlarınla aynı masaya otur.'}
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
                    ? 'Topluluk bağlantısı gerekli'
                    : undefined
              }
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus size={16} />
              Arkadaş davet et
            </button>
          )}
          {game && own && (
            <button
              disabled={fixture || activity.busy || !ready}
              title={fixture ? fixtureReason : undefined}
              onClick={() => void send({ type: 'game.leave' })}
            >
              <X size={16} />
              Masadan kalk
            </button>
          )}
          <button
            disabled={!!game && !access}
            title={game && !access ? 'Geçmiş için izleyici olarak katıl' : undefined}
            onClick={() => navigate('/games?tab=history')}
          >
            <History size={16} />
            {game ? 'Geçmiş' : 'Masa geçmişi'}
          </button>
          {game && (
            <IconButton label="Masayı yenile" onClick={refresh}>
              <RefreshCw size={17} />
            </IconButton>
          )}
        </div>
      </header>
      {game && <GameRecovery activity={activity} game={game} />}
      {!ready && (
        <div className={`rg-banner ${activity.status === 'error' ? 'error' : ''}`} role="status">
          {activity.status === 'loading'
            ? 'Masalar getiriliyor…'
            : !roomId
              ? 'Oyun için bir oda seç.'
              : 'Oyun hizmeti bağlantısı bekleniyor.'}
          <button onClick={() => (!roomId ? navigate('/settings?tab=connections') : refresh())}>
            {!roomId ? 'Topluluğa bağlan' : 'Yeniden dene'}
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
                      ? '2–9 oyuncu · Sanal fiş'
                      : kind === 'blackjack'
                        ? 'Otomatik krupiye · Sanal fiş'
                        : kind === 'batak'
                          ? '4 tür · 3 veya 4 oyuncu'
                          : '4 oyuncu · Tekli veya eşli'}
                  </p>
                  <button className="button secondary" onClick={() => onCreate(kind)}>
                    <Plus size={16} />
                    Masa oluştur
                  </button>
                </div>
              </article>
            ))}
          </div>
          <section className="rg-active-tables">
            <h3>Odanın masası</h3>
            <div>
              <Gamepad2 size={29} />
              <div>
                <strong>
                  {activity.status === 'loading'
                    ? 'Masalar getiriliyor'
                    : !ready
                      ? 'Masa bağlantısı bekleniyor'
                      : 'Açık oyun masası yok'}
                </strong>
                <p>
                  {activity.room?.primary
                    ? `Bu odada ${activity.room.primary.title} etkinliği açık.`
                    : !ready
                      ? 'Masa durumu bağlantı kurulunca alınır.'
                      : 'Bir oyun seçerek masa oluşturabilirsin.'}
                </p>
              </div>
            </div>
          </section>
          <div className="rg-voice-note">
            <Headphones size={17} />
            <span>Oyun penceresini kapatmak ses bağlantını kesmez.</span>
          </div>
          <p className="rg-footer-note">
            Yalnızca sanal fiş ve puan. Bir odada aynı anda tek ana medya veya oyun etkinliği
            başlatılabilir.
          </p>
        </>
      ) : waiting ? (
        <>
          <div className="rg-lobby">
            <section>
              <div className="rg-section-heading">
                <h3>Koltuklar</h3>
                <span>
                  {capacity} koltuk · {names[game.kind]}
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
                              ? 'Oyun botu'
                              : seat.userId === game.ownerId
                                ? 'Masa sahibi'
                                : seat.connected
                                  ? 'Masada'
                                  : 'Bağlantısı kesildi'}
                            {seat.userId === c.user?.id ? ' · sen' : ''}
                          </small>
                        </>
                      ) : (
                        <>
                          <Plus size={23} />
                          <span>Koltuk {index + 1} boş</span>
                          <div>
                            <button
                              disabled={!!own || !ready || fixture || activity.busy}
                              title={fixture ? fixtureReason : own ? 'Zaten masadasın' : undefined}
                              onClick={() => setBuyIn(index)}
                            >
                              Otur
                            </button>
                            {owner && (
                              <button
                                disabled={!ready || fixture || activity.busy}
                                title={fixture ? fixtureReason : undefined}
                                onClick={() => void send({ type: 'game.bot.add', seat: index })}
                              >
                                <Bot size={12} />
                                Bot ekle
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
                <strong>İzleyici</strong>
                <p>
                  {array<{ name: string }>(view.spectators)
                    .map((person) => person.name)
                    .join(' · ') || 'İzleyici yok'}
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
                    {view.watching ? 'İzlemeyi bırak' : 'İzle'}
                  </button>
                )}
              </div>
            </section>
            <aside className="rg-rules">
              <h3>
                Masa kuralları <SlidersHorizontal size={19} />
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
                  Düzenle
                </button>
              )}
              {ruleRows.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
              <p>Kurallar oyun başladığında kilitlenir.</p>
            </aside>
          </div>
          <div className="rg-hand-strip">
            <div>
              <h3>{game.seats.length === capacity ? 'Masa dolu' : 'Oyuncular bekleniyor'}</h3>
              <p>{startReason || 'Yeni el başlayabilir.'}</p>
            </div>
            {game.kind === 'blackjack' && own && (
              <label className="rg-lobby-bet">
                Sanal bahis
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
                  Bahsi belirle
                </button>
              </label>
            )}
            <button onClick={() => setRules(true)}>Masa kuralları</button>
            <button
              className="button primary"
              disabled={!!startReason || !can('start')}
              title={fixture ? fixtureReason : startReason}
              onClick={newHand}
            >
              <Spade size={17} />
              Oyunu başlat
            </button>
          </div>
        </>
      ) : !access ? (
        <section className="rx-watch">
          <Eye size={32} />
          <h2>Masayı izle</h2>
          <p>
            {game?.kind === 'holdem' && view.rules?.spectatorsAllowed === false
              ? 'Bu masada izleyici erişimi kapalı.'
              : 'Masaya izleyici olarak katıl.'}
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
            İzle
          </button>
        </section>
      ) : (
        <>
          {!own && (
            <div className="rg-banner">
              İzleyici · Gizli kartlar gösterilmez.
              <button
                disabled={fixture || !ready || activity.busy}
                onClick={() => void send({ type: 'game.watch', watching: false })}
              >
                İzlemeyi bırak
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
                    ended: 'El tamamlandı',
                  } as Record<string, string>
                )[String(view.stage)] ?? 'Masa'}
              </small>
              <strong>
                <Coins size={18} />
                {pot.toLocaleString('tr-TR')} <span>pot</span>
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
                      {item.kind === 'main' ? 'Ana pot' : `Yan pot ${index}`} ·{' '}
                      {item.amount.toLocaleString('tr-TR')}
                      {item.split ? ' · Paylaşıldı' : ''}
                      {item.winners.length
                        ? ` · ${item.winners.map((id) => `${seatName(id)}${Number.isFinite(item.awards[id]) ? ` +${item.awards[id].toLocaleString('tr-TR')}` : ''}`).join(', ')}`
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
                            {isOwn ? ' · sen' : ''}
                          </strong>
                          <small>
                            {Number(details?.chips ?? seat.chips).toLocaleString('tr-TR')} fiş
                            {seat.bot ? ' · BOT' : ''}
                          </small>
                        </div>
                        {Number(view.button) ===
                          projected.findIndex((item) => item.userId === seat.userId) && <b>D</b>}
                      </div>
                      <small>
                        {seat.pendingNextHand
                          ? 'Sonraki el bekleniyor'
                          : details?.folded
                            ? 'Eli bıraktı'
                            : game.status === 'finished' && Number(payouts[seat.userId]) > 0
                              ? `${splitPot ? 'Ortak kazanan' : 'Kazanan'}${view.showdown?.[seat.userId] ? ` · ${pokerCategory(view.showdown[seat.userId].category)}` : ''}`
                              : details && Number(details.chips) === 0 && playing
                                ? 'All-in'
                                : game.turn === index
                                  ? isOwn
                                    ? 'Sıra sende'
                                    : `Sıra ${seat.name} kişisinde`
                                  : !seat.connected
                                    ? 'Bağlantısı kesildi'
                                    : details && Number(details.streetBet) > 0
                                      ? `Bahis · ${details.streetBet}`
                                      : 'Masada'}
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
                            ? 'Zaten masadasın'
                            : playing
                              ? 'Sonraki el için katıl'
                              : undefined
                      }
                      onClick={() => setBuyIn(index)}
                    >
                      <Plus size={20} />
                      Boş koltuk
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
                      ? 'Pot paylaşıldı'
                      : winners.length > 1
                        ? 'Potlar dağıtıldı'
                        : 'El tamamlandı'}
                  </h3>
                  <p>
                    {winners
                      .map(
                        ([id, value]) =>
                          `${seatName(id)} · ${Number(value).toLocaleString('tr-TR')} fiş${view.showdown?.[id] ? ` · ${pokerCategory(view.showdown[id].category)}` : ''}`,
                      )
                      .join(' / ') || 'Sonuç ayrıntısı bu yanıtta bulunmuyor.'}
                  </p>
                </>
              ) : (
                <>
                  <span className="eyebrow">{own ? 'ELİN' : 'CANLI MASA'}</span>
                  <h3>
                    {mine?.folded
                      ? 'Bu eli bıraktın'
                      : mine && Number(mine.chips) === 0
                        ? 'Bütün fişlerin masada'
                        : myTurn
                          ? 'Sıra sende'
                          : game.seats.find((seat) => seat.seat === game.turn)?.name
                            ? `${game.seats.find((seat) => seat.seat === game.turn)!.name} bekleniyor`
                            : 'El devam ediyor'}
                  </h3>
                  {own && (
                    <p>
                      Kalan fişin: {chips.toLocaleString('tr-TR')}
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
                  {myTurn ? 'Sıra sende' : 'Oyuncu bekleniyor'}
                  <small>Sunucu hamle süresi</small>
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
                  Bırak
                </button>
                {legal.includes('check') ? (
                  <button
                    className="button secondary"
                    disabled={!can('check')}
                    onClick={() => action('check')}
                  >
                    Kontrol et
                  </button>
                ) : (
                  <button
                    className="button secondary"
                    disabled={!can('call')}
                    onClick={() => action('call')}
                  >
                    Gör · {Math.min(chips, call)}
                  </button>
                )}
                <button className="button primary" disabled={!can('raise')} onClick={openRaise}>
                  Artır · {Math.min(maxRaise, minRaise)}
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
                Sonraki el
              </button>
            )}
            {own && !own.connected && (
              <button
                className="button secondary"
                disabled={fixture || !ready || activity.busy}
                onClick={() => void send({ type: 'game.sit', seat: own.seat })}
              >
                Masaya geri dön
              </button>
            )}
          </div>
          <p className="rg-footer-note">
            Yalnızca sunucunun açtığı eller görünür. Katlanmış eller diğer oyunculara gösterilmez.
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
          Masayı kapat
        </button>
      )}
      {activity.error && (
        <div className="rg-banner error" role="alert">
          {activity.error}
        </div>
      )}
      {history && (!game || access) && (
        <Modal title="Masa geçmişi" className="rg-modal" onClose={() => setHistory(false)}>
          <div className="rg-modal-body">
            {game?.history.length ? (
              game.history.map((hand) => (
                <div className="rg-history-row" key={hand.hand}>
                  <Trophy size={17} />
                  <strong>El {hand.hand}</strong>
                  <small>{new Date(hand.endedAt).toLocaleTimeString('tr-TR')}</small>
                  <p>
                    {Object.entries(object(hand.result.payouts))
                      .map(([id, value]) => `${seatName(id)} · ${value} fiş`)
                      .join(' / ') || 'El tamamlandı'}
                  </p>
                </div>
              ))
            ) : (
              <p>Tamamlanmış el yok.</p>
            )}
          </div>
        </Modal>
      )}
      {rules && (
        <Modal title="Masa kuralları" className="rg-modal" onClose={() => setRules(false)}>
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
        <Modal title="Masaya katıl" className="rg-modal" onClose={() => setBuyIn(null)}>
          <div className="rg-modal-body">
            {game?.kind === 'holdem' ? (
              <>
                <div className="rg-buy-in">
                  <Coins size={28} />
                  <strong>Sanal fiş</strong>
                </div>
                <label>
                  Giriş miktarı
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
                    ? `${nativeRules.minBuyIn} – ${nativeRules.maxBuyIn} sanal fiş`
                    : 'Masa giriş kuralları henüz alınmadı.'}
                </p>
                {playing && <p>Bu el dağıtıldı. Sonraki elde oynayacaksın.</p>}
              </>
            ) : (
              <p>Koltuk {buyIn + 1}</p>
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
              Vazgeç
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
              Katıl
            </button>
          </footer>
        </Modal>
      )}
      {raise && (
        <Modal title="Artırma tutarı" className="rg-modal rg-raise" onClose={() => setRaise(false)}>
          <div className="rg-modal-body">
            <div className="rg-raise-call">
              <span>Karşılanacak bahis</span>
              <strong>{call} sanal fiş</strong>
            </div>
            <label>
              Bu turdaki toplam tutarın
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
                aria-label="Artırma tutarı"
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
                Minimum {Math.min(minRaise, maxRaise)}
              </button>
              <button className="button secondary" onClick={() => setAmount(maxRaise)}>
                All-in · {maxRaise}
              </button>
            </div>
            <p>
              {maxRaise < minRaise
                ? `All-in toplamı ${maxRaise.toLocaleString('tr-TR')}. Minimum artırma için yeterli fişin yok.`
                : `Minimum toplam artırma ${minRaise.toLocaleString('tr-TR')}. Bunun ${call.toLocaleString('tr-TR')} fişi görme, ${Math.max(0, minRaise - maximumBet).toLocaleString('tr-TR')} fişi artırmadır.`}
            </p>
            {activity.error && (
              <div className="rg-banner error" role="alert">
                {activity.error}
              </div>
            )}
          </div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => setRaise(false)}>
              Vazgeç
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
              {amount} fişe artır
            </button>
          </footer>
        </Modal>
      )}
      {end && (
        <Modal title="Masayı kapat?" className="rg-modal" onClose={() => setEnd(false)}>
          <div className="rg-modal-body">
            <p>Oyun etkinliği biter. Ses bağlantısı bu işlemden bağımsızdır.</p>
            {activity.error && (
              <div className="rg-banner error" role="alert">
                {activity.error}
              </div>
            )}
          </div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => setEnd(false)}>
              Vazgeç
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
              Masayı kapat
            </button>
          </footer>
        </Modal>
      )}
      {configure && (
        <Modal
          title="Masa kurallarını düzenle"
          className="rg-modal"
          onClose={() => setConfigure(false)}
        >
          <div className="rg-modal-body">
            <HoldemRulesForm value={holdemRules} onChange={setHoldemRules} />
            {activity.error && <p role="alert">{activity.error}</p>}
          </div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => setConfigure(false)}>
              Vazgeç
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
              Kaydet
            </button>
          </footer>
        </Modal>
      )}
      {inviteOpen && (
        <Modal title={`${roomName} daveti`} className="rg-modal rg-invite" onClose={closeInvite}>
          <div className="rg-modal-body">
            <p>Bu davet topluluğa katılmak içindir. Masada koltuk ayırmaz.</p>
            {inviteCode ? (
              <>
                <label>
                  Davet kodu
                  <input
                    autoFocus
                    readOnly
                    value={inviteCode}
                    onFocus={(event) => event.target.select()}
                  />
                </label>
                <div className="rg-invite-copy">
                  <button className="button secondary" onClick={() => void copyInvite(false)}>
                    Kodu kopyala
                  </button>
                  <button className="button primary" onClick={() => void copyInvite(true)}>
                    Bağlantıyı kopyala
                  </button>
                </div>
                {inviteCopied && <p role="status">Kopyalandı.</p>}
              </>
            ) : (
              <button
                className="button primary"
                disabled={fixture || inviteBusy || !roomId || c.status !== 'connected'}
                title={fixture ? fixtureReason : undefined}
                onClick={() => void generateInvite()}
              >
                {inviteBusy ? 'Oluşturuluyor…' : 'Davet oluştur'}
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
          title={`${names[create]} masası`}
          className="rg-modal"
          onClose={() => onCreate(null)}
        >
          <div className="rg-modal-body">
            {create === 'holdem' && (
              <HoldemRulesForm value={holdemRules} onChange={setHoldemRules} />
            )}
            <p>Yalnızca sanal fiş ve puan.</p>
            {activity.room?.primary && (
              <div className="rg-banner">
                {activity.room.primary.title} etkinliği açık.
                <button
                  onClick={() => {
                    onCreate(null);
                    navigate(
                      activity.room?.primary?.activity === 'cinema'
                        ? '/cinema'
                        : activity.room?.primary?.activity === 'youtube'
                          ? '/cinema'
                          : '/voice',
                    );
                  }}
                >
                  Etkinliği aç
                </button>
                {create === 'holdem' && (
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
                    <span>{currentPrimary?.title} etkinliğini bitir ve yeni masayı kur</span>
                  </label>
                )}
                {create === 'holdem' && !canReplace && (
                  <p>Etkinliği değiştirmek için başlatma ve kontrol yetkisi gerekli.</p>
                )}
                <p>Ses bağlantısı devam eder. Mevcut kuyruk korunur.</p>
              </div>
            )}
          </div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => onCreate(null)}>
              Vazgeç
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
                    ? 'Etkinliği değiştirmeyi onayla veya önce bitir'
                    : !ready
                      ? 'Etkinlik bağlantısı gerekli'
                      : undefined
              }
              onClick={() =>
                void send({
                  type: 'game.create',
                  game: create,
                  ...(create === 'holdem'
                    ? {
                        holdem: holdemRules,
                        ...(canReplace && replacementMatches
                          ? { replacePrimary: replaceConsent }
                          : {}),
                      }
                    : {}),
                }).then((ok) => {
                  if (ok) onCreate(null);
                })
              }
            >
              Masayı kur
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
    c.channels.find((channel) => channel.id === activity.room?.roomId)?.name ?? 'Oda';
  const ruleRows: [string, string][] =
    game.kind === 'blackjack'
      ? [
          ['Deste', '6'],
          ['Krupiye', 'Soft 17’de durur (S17)'],
          ['Blackjack', '3:2'],
          ['Insurance', 'Kapalı'],
          ['Double', 'İlk iki kartta'],
          ['Split', 'Aynı puan değeri · En fazla 4 el'],
          ['Split As', 'Tek kart · yeniden ayırma kapalı'],
        ]
      : game.kind === 'batak'
        ? [
            ['Tür', String(view.variant ?? '—')],
            ['Koz', suits[String(view.trump)] ?? '—'],
            ['Oyuncu', String(game.seats.length)],
            ['Gömmeli akışı', 'İhale → koz → 4 kart gömme → oyun'],
          ]
        : [
            ['Açılış', '101'],
            ['Çift açılışı', '5 çift'],
            ['Katlamalı', object(view.rules).folding ? 'Açık' : 'Kapalı'],
            ['Eşli', object(view.rules).teams ? 'Açık' : 'Kapalı'],
            ['Bitirme', 'Son taş atılır'],
          ];
  return (
    <div className={`rg-page rx-game rx-${game.kind}`}>
      <header className="rg-heading">
        <div>
          <div className="rg-title">
            <h1>{game.status === 'finished' ? 'El tamamlandı' : names[game.kind]}</h1>
            <span>Kurallar kilitli</span>
          </div>
          <p>
            {roomName} · {names[game.kind]} · Sanal {game.kind === 'blackjack' ? 'fiş' : 'puan'}
          </p>
        </div>
        <div>
          <button onClick={() => setRules(true)}>
            <ShieldCheck size={16} />
            Masa kuralları
          </button>
          <button
            disabled={!access}
            title={!access ? 'Geçmiş için izleyici olarak katıl' : undefined}
            onClick={() => navigate('/games?tab=history')}
          >
            <History size={16} />
            Geçmiş
          </button>
          <IconButton label="Masayı yenile" onClick={() => void activity.refresh()}>
            <RefreshCw size={16} />
          </IconButton>
          {own && (
            <button
              disabled={fixture || !ready || busy}
              onClick={() => void send({ type: 'game.leave' })}
            >
              Masadan kalk
            </button>
          )}
        </div>
      </header>
      <GameRecovery activity={activity} game={game} />
      {activity.error && (
        <div className="rg-banner error" role="alert">
          <span>{activity.error}</span>
          <button onClick={() => void activity.refresh()}>Yeniden dene</button>
        </div>
      )}
      {!ready && !activity.error && (
        <div className="rg-banner" role="status">
          <span>Masa bağlantısı bekleniyor.</span>
          <button onClick={() => void activity.refresh()}>Yeniden dene</button>
        </div>
      )}
      {!access ? (
        <section className="rx-watch">
          <Eye size={32} />
          <h2>Masayı izle</h2>
          <p>
            {game.kind === 'holdem' && view.rules?.spectatorsAllowed === false
              ? 'Bu masada izleyici erişimi kapalı.'
              : 'Masaya izleyici olarak katıl.'}
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
                ? 'Yerel örnekte hesap işlemleri kapalı'
                : game?.kind === 'holdem' && view.rules?.spectatorsAllowed === false
                  ? 'Masa izleyici kabul etmiyor'
                  : undefined
            }
            onClick={() => void send({ type: 'game.watch', watching: true })}
          >
            İzle
          </button>
        </section>
      ) : (
        <>
          {!own && (
            <div className="rg-banner">
              <Eye size={17} />
              İzleyici · Gizli eller gösterilmez.
              <button
                disabled={fixture || !ready || busy}
                onClick={() => void send({ type: 'game.watch', watching: false })}
              >
                İzlemeyi bırak
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
              El tamamlandı
            </h3>
            <p>{owner ? 'Yeni el başlatabilirsin.' : 'Masa sahibi bekleniyor.'}</p>
          </div>
          <button
            className="button primary"
            disabled={!can('start')}
            onClick={() => void action('start')}
          >
            Sonraki el
          </button>
        </div>
      )}
      {owner && (
        <button
          className="rg-end"
          disabled={fixture || busy || !ready}
          onClick={() => setEnd(true)}
        >
          Masayı kapat
        </button>
      )}
      {rules && (
        <Modal title="Masa kuralları" className="rg-modal" onClose={() => setRules(false)}>
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
        <Modal title="Masa geçmişi" className="rg-modal" onClose={() => setHistory(false)}>
          <div className="rg-modal-body">
            {game.history.length ? (
              game.history.map((hand) => (
                <div className="rg-history-row" key={hand.hand}>
                  <Trophy size={16} />
                  <strong>El {hand.hand}</strong>
                  <small>{new Date(hand.endedAt).toLocaleString('tr-TR')}</small>
                  <GameResults game={game} result={hand.result} />
                </div>
              ))
            ) : (
              <p>Tamamlanmış el yok.</p>
            )}
          </div>
        </Modal>
      )}
      {end && (
        <Modal title="Masayı kapat?" className="rg-modal" onClose={() => setEnd(false)}>
          <div className="rg-modal-body">
            <p>Oyun etkinliği biter. Ses bağlantısı açık kalır.</p>
            {activity.error && <p role="alert">{activity.error}</p>}
          </div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => setEnd(false)}>
              Vazgeç
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
              Masayı kapat
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
            <th>Oyuncu</th>
            <th>Puan</th>
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
            {game.seats.find((seat) => seat.userId === item.userId)?.name ?? 'Oyuncu'} · El{' '}
            {Number(item.hand) + 1} ·{' '}
            {(
              {
                win: 'Kazandı',
                lose: 'Kaybetti',
                push: 'Berabere',
                blackjack: 'Blackjack',
              } as Record<string, string>
            )[String(item.outcome)] ?? String(item.outcome ?? 'Sonuç')}{' '}
            · {Number(item.returned)} fiş geri aldı
          </p>
        ))}
      </div>
    );
  return <p>Sonuç ayrıntısı bu yanıtta bulunmuyor.</p>;
}
function TurnClock({ timer }: { timer: number | null }) {
  return timer === null ? null : (
    <div className="rg-timer">
      <Clock3 size={18} />
      <b>{timer}</b>
      <span>saniye</span>
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
        <span>6 deste</span>
        <span>Soft 17 · S17</span>
        <span>Blackjack 3:2</span>
        <span>Insurance kapalı</span>
        <span>El {game.history.length + 1}</span>
      </div>
      <section className="rx-blackjack-felt">
        <div className="rx-dealer">
          <small>KRUPİYE</small>
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
                  EL {index + 1} ·{' '}
                  {active
                    ? 'Sıra sende'
                    : hand.state === 'bust'
                      ? 'Aştı'
                      : hand.state === 'stood'
                        ? 'Durdu'
                        : 'El tamamlandı'}
                </small>
                <div>
                  {cards.map((card) => (
                    <PlayingCard key={card.id} card={card} />
                  ))}
                </div>
                <strong>{blackjackTotal(cards as EngineCard[])}</strong>
                <p>{Number(hand.bet)} sanal fiş</p>
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
                {seat.userId === userId ? ' · sen' : ''}
              </strong>
              <small>
                {Number(
                  players.find((player) => player.userId === seat.userId)?.credits ?? seat.chips,
                )}{' '}
                fiş
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
                ? 'Sıra sende'
                : game.status === 'finished'
                  ? 'El tamamlandı'
                  : 'Oyuncu bekleniyor'}
            </h3>
          </div>
          <TurnClock timer={timer} />
          {game.status === 'playing' ? (
            <div className="rg-actions">
              {(
                [
                  ['hit', 'Kart al'],
                  ['stand', 'Dur'],
                  ['double', 'İkiye katla'],
                  ['split', 'Ayır'],
                ] as const
              ).map(([name, label]) => (
                <button
                  className={`button ${name === 'hit' ? 'primary' : 'secondary'}`}
                  key={name}
                  disabled={!can(name)}
                  title={!can(name) ? 'Bu hamle şu anda sunucu tarafından izinli değil' : undefined}
                  onClick={() => void action(name)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <label className="rg-lobby-bet">
              Sonraki el bahsi
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
                Bahsi belirle
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
              ihaleli: 'İhaleli',
              esli: 'Eşli',
              'koz-maca': 'Koz Maça',
              gommeli: 'Gömmeli',
            } as Record<string, string>
          )[variant] ?? 'Batak'}
        </span>
        <span>İhale {view.bid ? String(view.bid) : '—'}</span>
        <span>Koz {suits[String(view.trump)] ?? '—'}</span>
        <span>El {game.history.length + 1}</span>
      </div>
      {['bidding', 'trump', 'bury'].includes(stage) ? (
        <div className="rx-batak-setup">
          <section>
            <header>
              <h2>
                {stage === 'bidding' ? 'İhale ver' : stage === 'trump' ? 'Koz seç' : '4 kart göm'}
              </h2>
              <TurnClock timer={timer} />
            </header>
            {stage === 'bidding' ? (
              <>
                <p>
                  {own?.seat === game.turn
                    ? 'Sıra sende'
                    : `${game.seats.find((seat) => seat.seat === game.turn)?.name ?? 'Oyuncu'} bekleniyor`}
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
                    Pas
                  </button>
                  <button
                    className="button primary"
                    disabled={!can('bid') || bid < minimum || bid > maximum}
                    onClick={() => void action('bid', { amount: bid })}
                  >
                    {bid} · İhale ver
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
                              clubs: 'Sinek',
                              diamonds: 'Karo',
                              hearts: 'Kupa',
                              spades: 'Maça',
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
                    Kozu onayla
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
                  <span>{selected.length} / 4 kart</span>
                  <button
                    className="button primary"
                    disabled={!can('bury') || selected.length !== 4}
                    onClick={() =>
                      void action('bury', { tileIds: selected }).then((ok) => {
                        if (ok) setSelected([]);
                      })
                    }
                  >
                    4 kartı göm
                  </button>
                </footer>
              </>
            )}
          </section>
          <aside>
            <h3>Oyuncular</h3>
            {game.seats.map((seat) => (
              <div className="rx-bid-player" key={seat.userId}>
                <Avatar name={seat.name} />
                <strong>{seat.name}</strong>
                <span>
                  {bids[seat.seat] > 0
                    ? `${bids[seat.seat]} ihale`
                    : seat.seat === game.turn
                      ? 'Sıra onda'
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
                <span>{game.status === 'finished' ? 'El tamamlandı' : 'Kart bekleniyor'}</span>
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
                    {tricks[seat.seat] ?? 0} el ·{' '}
                    {Number(hands.find((hand) => hand.seat === seat.seat)?.count ?? 0)} kart
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
            <strong>ELİN · {cards.length} kart</strong>
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
      aria-label={`${tile.color} ${tile.joker ? 'Okey' : tile.value}`}
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
    if (!groups.length) validation = 'Açmak için seri veya çift hazırla';
    else if (used.length >= tiles.length) validation = 'Atmak için bir taş bırak';
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
        validation = 'Geçerli çift hazırla';
    } else preview.forEach(validate101Meld);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    validation =
      code === 'OPENING_TOO_LOW'
        ? `Açılış için en az ${threshold} puan gerekir`
        : code === 'INVALID_PAIRS_OPENING'
          ? 'En az 5 geçerli çift gerekir'
          : 'Hazır gruplardan biri geçersiz';
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
        <span>{rules.folding ? 'Katlamalı' : 'Katlamasız'}</span>
        <span>{rules.teams ? 'Eşli' : 'Tekli'}</span>
        <span>Açılış {threshold}</span>
        <span>5 çift</span>
        <span>El {game.history.length + 1}</span>
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
                  {Number(hands.find((hand) => hand.seat === seat.seat)?.count ?? 0)} taş ·{' '}
                  {array<string | null>(view.opened)[seat.seat] ? 'Açtı' : 'Açmadı'}
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
                    {game.seats.find((seat) => seat.seat === meld.owner)?.name ?? 'Oyuncu'} ·{' '}
                    {meld.pairs ? 'Çift' : 'Seri'}
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
              <p>Henüz seri açılmadı.</p>
            )}
          </div>
          <aside>
            <span>Kapalı taşlar</span>
            <strong>{String(view.remainingStock ?? '—')}</strong>
            {!!view.indicator && (
              <>
                <small>Gösterge</small>
                <OkeyTileView tile={view.indicator as Tile} />
              </>
            )}
          </aside>
        </div>
        <div className="rx-discards">
          {discards.map((stack, index) => (
            <div key={index}>
              <small>
                {game.seats.find((seat) => seat.seat === index)?.name ?? `Koltuk ${index + 1}`} ·
                Son atılan
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
              <strong>ELİN · {tiles.length} taş</strong>
              <div>
                <button className="text-button" onClick={() => setSorted((value) => !value)}>
                  Diz · {sorted ? 'Renk' : 'Dağıtım'}
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
                <h3>{opened ? 'Taş işle veya yeni grup aç' : 'Açılış hazırla'}</h3>
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
                    Seri
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
                    Çift
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
                      aria-label={`Grup ${index + 1} kaldır`}
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
                  Seçimi {pairs ? 'çift' : 'seri'} yap
                </button>
                <span role="status" className={validation && groups.length ? 'invalid' : ''}>
                  {validation || (pairs ? `${groups.length} çift` : `${total} puan · Hazır`)}
                </span>
                <button
                  className="button primary"
                  disabled={!can(pairs ? 'open-pairs' : 'open') || !!validation}
                  onClick={commit}
                >
                  {pairs ? 'Çift aç' : 'Seri aç'}
                </button>
              </footer>
              {target !== null && melds[target] && (
                <div className="rx-process">
                  <label>
                    Seri {target + 1}
                    <select value={joker} onChange={(event) => setJoker(event.target.value)}>
                      <option value="">Uçtan işle</option>
                      {melds[target].tiles
                        .filter((tile) => tile.joker)
                        .map((tile) => (
                          <option key={tile.id} value={tile.id}>
                            Okeyi değiştir · {tile.value}
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
                    Seçili taşları işle
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setTarget(null);
                      setJoker('');
                    }}
                  >
                    Vazgeç
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
                    ? 'Taş çek'
                    : 'Taş at'
                  : 'Oyuncu bekleniyor'}
              </h3>
              <p>{opened ? (opened === 'pairs' ? 'Çift açtın' : 'Seri açtın') : 'Henüz açmadın'}</p>
            </div>
            <div className="rg-actions">
              {stage === 'draw' ? (
                <>
                  <button
                    className="button secondary"
                    disabled={!can('draw') || !previous}
                    onClick={() => void action('draw', { cardId: 'discard' })}
                  >
                    Önceki taşı al
                  </button>
                  <button
                    className="button primary"
                    disabled={!can('draw')}
                    onClick={() => void action('draw')}
                  >
                    Kapalı taş çek
                  </button>
                </>
              ) : (
                <>
                  {stage === 'discard' && can('draw') && (
                    <button className="button secondary" onClick={() => void action('draw')}>
                      Aldığın taşı geri bırak ve kapalı çek
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
                    {tiles.length === 1 ? 'Bitir · Son taşı at' : 'Seçili taşı at'}
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
        'high-card': 'Yüksek kart',
        'one-pair': 'Bir çift',
        'two-pair': 'İki çift',
        'three-of-a-kind': 'Üçlü',
        straight: 'Kent',
        flush: 'Renk',
        'full-house': 'Full house',
        'four-of-a-kind': 'Kare',
        'straight-flush': 'Sıralı renk',
      } as Record<string, string>
    )[category] ?? 'El'
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
        Masa adı
        <input
          autoFocus
          maxLength={32}
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </label>
      {(
        [
          ['capacity', 'Koltuk sayısı', 2, 9],
          ['smallBlind', 'Small blind', 1, 100000],
          ['bigBlind', 'Big blind', 1, 100000],
          ['minBuyIn', 'Minimum giriş', 1, 1000000],
          ['maxBuyIn', 'Maksimum giriş', 1, 1000000],
          ['initialChips', 'Başlangıç fişi', 1, 1000000],
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
        İzleyici kabul et
      </label>
      {!validHoldemRules(value) && (
        <p className="wide" role="status">
          Blind ve giriş aralıklarını kontrol et. Başlangıç fişi giriş aralığında olmalı.
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
    ['ihaleli', 'İhaleli', '♣', '4 oyuncu · Tekli'],
    ['esli', 'Eşli', '♠', '4 oyuncu · 2 + 2'],
    ['koz-maca', 'Koz Maça', '♠', '4 oyuncu · Sabit koz'],
    ['gommeli', 'Gömmeli', '♦', '3 oyuncu · 4 kart gömme'],
  ] as const;
  return (
    <div className="rg-page rx-create">
      <header className="rg-heading">
        <div>
          <h1>{kind === 'batak' ? 'Hangi Batak?' : '101 Okey masası'}</h1>
          <p>{kind === 'batak' ? 'Batak türünü seç.' : 'Masa kurallarını seç.'}</p>
        </div>
        <div>
          <button onClick={() => setRulesOpen(true)}>
            <ShieldCheck size={16} />
            Masa kuralları
          </button>
          <button onClick={onCancel}>
            <X size={16} />
            Vazgeç
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
                <strong>{value ? 'Katlamalı' : 'Katlamasız'}</strong>
                <small>{value ? 'Önceki açılış toplamını geç' : 'Açılış en az 101'}</small>
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
                <strong>{value ? 'Eşli' : 'Tekli'}</strong>
                <small>{value ? '2 + 2 oyuncu' : '4 oyuncu'}</small>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="rx-create-body">
        <section>
          <h3>Odadaki kişiler</h3>
          {participants.length ? (
            participants.map((person) => (
              <div className="rx-create-participant" key={person.userId}>
                <Avatar name={person.displayName} />
                <strong>{person.displayName}</strong>
              </div>
            ))
          ) : (
            <p>Katılımcı bilgisi henüz alınmadı.</p>
          )}
          <p className="rg-footer-note">Masa kurulduktan sonra oyuncular koltuk seçer.</p>
        </section>
        <aside className="rg-rules">
          <h3>Masa özeti</h3>
          <div>
            <span>Oyun</span>
            <strong>{names[kind]}</strong>
          </div>
          <div>
            <span>Oyuncu</span>
            <strong>{count}</strong>
          </div>
          {kind === 'batak' ? (
            <>
              <div>
                <span>Tür</span>
                <strong>{modes.find((mode) => mode[0] === variant)?.[1]}</strong>
              </div>
              <div>
                <span>Akış</span>
                <strong>
                  {variant === 'gommeli'
                    ? 'İhale · Koz · Gömme · Oyun'
                    : variant === 'koz-maca'
                      ? 'Tahmin · Oyun'
                      : 'İhale · Koz · Oyun'}
                </strong>
              </div>
            </>
          ) : (
            <>
              <div>
                <span>Açılış</span>
                <strong>101 · 5 çift</strong>
              </div>
              <div>
                <span>Katlamalı</span>
                <strong>{folding ? 'Açık' : 'Kapalı'}</strong>
              </div>
              <div>
                <span>Eşli</span>
                <strong>{teams ? 'Açık' : 'Kapalı'}</strong>
              </div>
            </>
          )}
          <div>
            <span>Puan</span>
            <strong>Yalnızca sanal</strong>
          </div>
        </aside>
      </div>
      {reason && (
        <div className="rg-banner" role="status">
          {reason}
        </div>
      )}
      {error && (
        <div className="rg-banner error" role="alert">
          {error}
        </div>
      )}
      <footer>
        <button className="button secondary" onClick={onCancel}>
          Vazgeç
        </button>
        <button
          className="button primary"
          disabled={busy || disabled}
          title={reason || undefined}
          onClick={onSubmit}
        >
          Masayı kur
        </button>
      </footer>
      {rulesOpen && (
        <Modal title="Masa kuralları" className="rg-modal" onClose={() => setRulesOpen(false)}>
          <div className="rg-modal-body rg-rules">
            {(kind === 'batak'
              ? [
                  ['Oyuncu', String(count)],
                  [
                    'İhale',
                    variant === 'koz-maca'
                      ? 'Her oyuncu 1–13 tahmin verir'
                      : variant === 'esli' || variant === 'gommeli'
                        ? 'En az 8'
                        : 'En az 5',
                  ],
                  ['Renge uyma', 'Zorunlu · Mümkünse yükselt'],
                  ['Gömmeli', 'Koz seçimi sonrası 4 kart gömülür'],
                  ['Puan', 'Sunucunun mevcut Batak puan profili'],
                ]
              : [
                  ['Oyuncu', '4 · Eşler karşılıklı'],
                  ['Dağıtım', 'Başlayan 22, diğerleri 21 taş'],
                  ['Açılış', folding ? 'Son açıştan en az 1 fazla · İlk 101' : 'En az 101'],
                  ['Çift', 'En az 5 çift'],
                  ['Açma türü', 'Seri ve çift aynı oyuncuda karıştırılmaz'],
                  ['Okey', 'Göstergenin bir üstü'],
                  ['Bitirme', 'Son taş atılır'],
                  ['Puan', 'Kazanan −101 · Açmayan 202 · Okey bitişi iki kat'],
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
        ? 'Hamle süresi doldu'
        : event?.type === 'control-returned'
          ? 'Kontrol sana döndü'
          : event?.type === 'return-requested'
            ? 'Masaya dönüş istendi'
            : 'Bot devraldı',
    title =
      !current && event
        ? eventTitle
        : returning
          ? 'Masaya dönüş bekleniyor'
          : recovery.takeover
            ? 'Bot koltuğunu devraldı'
            : connected
              ? 'Koltuğuna geri dön'
              : 'Bağlantın kesildi';
  const reason = fixture
    ? 'Yerel örnekte gerçek oyun işlemi kapalı'
    : !connected
      ? 'Önce oda bağlantısı kurulmalı'
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
        ? `Sunucu eli bıraktı${event.toCall !== undefined ? `; karşılanacak bahis ${event.toCall} fişti` : ''}.`
        : event.action === 'check'
          ? 'Karşılanacak bahis yoktu; sunucu kontrol etti.'
          : `Sunucu süre sonunda ${event.action ?? 'izinli hamleyi'} uyguladı.`
      : event?.type === 'control-returned'
        ? 'Sunucu koltuğunun kontrolünü güvenli sırada sana döndürdü.'
        : event?.type === 'return-requested'
          ? 'Dönüş isteğin sunucuda kaydedildi.'
          : 'Sunucu bağlantı kesintisinden sonra bot kontrolünü başlattı.';
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
                ? 'Bot mevcut hamleyi tamamlar; kontrol güvenli sırada sana döner.'
                : recovery.takeover
                  ? 'Oyun botla devam ediyor. Koltuğuna dönebilirsin.'
                  : seconds !== null
                    ? `${seconds} saniye sonra bot devralabilir. Koltuğuna daha sonra da dönebilirsin.`
                    : 'Masadaki yerin korunuyor.'}
          </p>
        </div>
        {!recovery.takeover && seconds !== null && <b>{seconds}s</b>}
      </div>
      <div className="rh-recovery-steps">
        <span>Bağlantı kesildi</span>
        <span>Bot devralır</span>
        <span>Güvenli sırada geri dön</span>
      </div>
      {event && (
        <div className="rh-recovery-record">
          <small>
            El {event.hand} · {new Date(event.at).toLocaleString('tr-TR')}
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
              ? ` · El ${event.hand}`
              : ''}
        </span>
        <button onClick={() => setOpen(true)}>Ayrıntılar</button>
        {current && !returning && (
          <button
            disabled={!!reason || pending || activity.busy}
            title={reason || undefined}
            onClick={() => void reclaim()}
          >
            Masaya geri dön
          </button>
        )}
        {!current && event && (
          <button
            aria-label="Kayıt bildirimini kapat"
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
              Masayı göster
            </button>
            {!current ? null : !connected ? (
              <button className="button primary" onClick={() => void activity.refresh()}>
                Yeniden bağlan
              </button>
            ) : (
              <button
                className="button primary"
                disabled={!!reason || pending || activity.busy || returning}
                title={reason || undefined}
                onClick={() => void reclaim()}
              >
                {returning ? 'Güvenli sıra bekleniyor' : 'Masaya geri dön'}
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
      return `${player.net > 0 ? '+' : ''}${player.net} fiş`;
    if (table.kind === 'holdem') {
      const paid = object(result.payouts)[community.user?.id ?? ''];
      return paid !== undefined ? `${Number(paid)} fiş ödendi` : 'Ödeme yok';
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
                    win: 'Kazandı',
                    lose: 'Kaybetti',
                    push: 'Berabere',
                    blackjack: 'Blackjack',
                  }) as Record<string, string>
                )[String(item.outcome)] ?? 'Sonuç',
            )
            .join(' · ')
        : '—';
    }
    const own = entry.seats?.find((seat) => seat.userId === community.user?.id);
    const scores = array<number>(result.scores);
    return own && scores[own.position] !== undefined
      ? `${scores[own.position]} puan`
      : 'Koltuk puanları';
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
          <h1>Masa geçmişi</h1>
          <p>Tamamlanan eller ve sunucuda kaydedilen sonuçlar.</p>
        </div>
        <div>
          <button onClick={() => navigate('/games')}>
            <ArrowRight size={16} />
            Oyun alanı
          </button>
          <IconButton label="Geçmişi yenile" onClick={() => void activity.refresh()}>
            <RefreshCw size={17} />
          </IconButton>
        </div>
      </header>
      <div className="rh-stats">
        {[
          ['Oynanan el', String(hands)],
          ['Kazanılan el', String(wins)],
          ['Kazanma oranı', hands ? `${Math.round((wins / hands) * 100)}%` : '—'],
          ['Geçmiş kaydı', String(rows.length)],
        ].map(([label, value]) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <section className="rh-history-panel">
        <header>
          <h3>Tamamlanan eller</h3>
          <label>
            Oyun
            <select
              aria-label="Geçmiş oyun filtresi"
              value={filter}
              onChange={(event) => setFilter(event.target.value as typeof filter)}
            >
              <option value="all">Tüm oyunlar</option>
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
            <h3>Geçmiş getiriliyor…</h3>
          </div>
        ) : activity.error ? (
          <div className="rh-empty rh-error">
            <h3>Geçmiş alınamadı</h3>
            <p>{activity.error}</p>
            <button className="button secondary" onClick={() => void activity.refresh()}>
              Yeniden dene
            </button>
          </div>
        ) : !access ? (
          <div className="rh-empty">
            <History size={30} />
            <h3>{game ? 'Önce masaya katıl.' : 'Açık masa yok.'}</h3>
            <p>
              {game
                ? 'Geçmiş için koltuk veya izleyici erişimi gerekir.'
                : 'Arşivli masa erişimi bu bağlantıda henüz uygulanmadı.'}
            </p>
            <button className="button secondary" onClick={() => navigate('/games')}>
              Oyun alanına dön
            </button>
          </div>
        ) : rows.length ? (
          <table className="rh-history-table">
            <thead>
              <tr>
                <th>Masa</th>
                <th>El</th>
                <th>Tarih</th>
                <th>Sonucun</th>
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
                  <td>{new Date(hand.endedAt).toLocaleString('tr-TR')}</td>
                  <td>{ownResult(table, hand.result, hand)}</td>
                  <td>
                    <button onClick={() => setDetail({ table, hand })}>
                      Ayrıntılar
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
            <h3>Henüz tamamlanan el yok.</h3>
            <button className="button secondary" onClick={() => navigate('/games')}>
              Masalara dön
            </button>
          </div>
        )}
      </section>
      <p className="rh-history-note">Puan ve sanal fiş farklıdır; toplam kazanç birleştirilmez.</p>
      {detail && (
        <Modal
          title={`${names[detail.table.kind]} · El ${detail.hand.hand}`}
          className="rg-modal rh-detail"
          onClose={() => setDetail(null)}
        >
          <div className="rg-modal-body">
            <p>{new Date(detail.hand.endedAt).toLocaleString('tr-TR')}</p>
            <HistoryDetails kind={detail.table.kind} entry={detail.hand} />
          </div>
          <footer className="rg-modal-footer">
            <button className="button secondary" onClick={() => setDetail(null)}>
              Geçmişe dön
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
    name = (id: string) => historical.find((seat) => seat.userId === id)?.name ?? 'Katılımcı';
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
                    {Number(player.net)} fiş
                  </strong>
                </div>
              ))
            : Object.entries(object(result.payouts)).map(([id, amount]) => (
                <div key={id}>
                  <span>{name(id)}</span>
                  <strong>{Number(amount)} fiş ödendi</strong>
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
            ? 'Diğer oyuncular eli bıraktı.'
            : 'Showdown sonucu'}
        </p>
        {!result.revealedCards && <p>Bu eski kayıtta açılmış kartlar bulunmuyor.</p>}
        <p>Katlanan oyuncuların gizli kartları paylaşılmaz.</p>
      </>
    );
  if (kind === 'blackjack')
    return (
      <>
        {array<Card>(result.dealer).length > 0 && (
          <div className="rh-dealer-history">
            <small>Krupiye · {Number(result.dealerTotal)}</small>
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
                  {Number(player.net)} fiş
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
                      El {Number(hand.hand) + 1} · {Number(hand.total)}
                    </strong>
                    <small>
                      Bahis {Number(hand.bet)} ·{' '}
                      {(
                        {
                          win: 'Kazandı',
                          lose: 'Kaybetti',
                          push: 'Berabere',
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
                    {name(String(item.userId))} · El {Number(item.hand) + 1}
                  </span>
                  <strong>
                    {String(item.outcome)} · {Number(item.returned)} fiş geri aldı
                  </strong>
                </div>
              ))}
            </div>
            <p>Bu eski kayıtta kartlar ve başlangıç bahsi bulunmuyor.</p>
          </>
        )}
      </>
    );
  return (
    <>
      {kind === 'batak' && Object.keys(contract).length > 0 && (
        <div className="rh-history-rules">
          <span>
            İhale {Number(contract.bid)} ·{' '}
            {historical.find((seat) => seat.position === Number(contract.bidder))?.name ??
              'Katılımcı'}
          </span>
          <span>Koz {suits[String(contract.trump)] ?? '—'}</span>
          <span>{String(result.variant ?? 'Batak')}</span>
        </div>
      )}
      {kind === '101' && result.lastDiscard && (
        <div className="rh-last-discard">
          <span>Son atılan taş</span>
          <OkeyTileView tile={result.lastDiscard as Tile} small />
        </div>
      )}
      <div className="rh-detail-rows">
        {scores.map((score, position) => {
          const seat = historical.find((seat) => seat.position === position);
          return (
            <div key={position}>
              <span>
                {seat?.name ?? `Koltuk sırası ${position + 1}`}
                {kind === 'batak' && array<number>(result.tricks)[position] !== undefined
                  ? ` · ${array<number>(result.tricks)[position]} el`
                  : ''}
                {kind === '101' && typeof result.winner === 'number' && result.winner === position
                  ? ' · Bitirdi'
                  : ''}
              </span>
              <strong>{score} puan</strong>
            </div>
          );
        })}
      </div>
      {kind === 'batak' && array<number[]>(result.teams).length > 0 && (
        <div className="rh-history-teams">
          {array<number[]>(result.teams).map((team, index) => (
            <article key={index}>
              <small>Takım {index + 1}</small>
              <strong>
                {team
                  .map(
                    (position) =>
                      historical.find((seat) => seat.position === position)?.name ?? 'Katılımcı',
                  )
                  .join(' + ')}
              </strong>
              <span>{team.reduce((sum, position) => sum + (scores[position] ?? 0), 0)} puan</span>
            </article>
          ))}
        </div>
      )}
      {!entry.seats && <p>Bu eski kayıtta oyuncu eşlemesi bulunmuyor.</p>}
      <p>
        {kind === '101'
          ? 'İlk açılış puanı ve son işlenen taş bu kayıtta bulunmuyor.'
          : 'El sonuçları sunucuda kaydedilen puanları gösterir.'}
      </p>
    </>
  );
}
