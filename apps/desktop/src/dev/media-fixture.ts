import type { DesktopBridge, ScreenPresenterState } from '@rooms/contracts';
import type { ActivityResponse, ActivityCommand, RoomSnapshot } from '@rooms/activity-protocol';
import type { MediaSnapshot, RealtimeMediaProvider } from '@rooms/media';
import { installDevelopmentRuntime } from '../runtime-sources';
import { useVoiceContext } from '../realtime';
import { useRooms } from '../store';
import { people, places, sample } from './sample';

const roomId = 'demo-channel-salon';
const serverTimeMs = Date.UTC(2026, 9, 10, 18, 47);
const artwork = '/__reference/01_brand/cinema-still.svg';
const personRecords = [
  { id: 'demo-deniz', name: people.deniz },
  { id: 'demo-ece', name: people.ece },
  { id: 'demo-can', name: people.can },
  { id: 'demo-zeynep', name: people.zeynep },
  { id: 'demo-mert', name: people.mert },
] as const;
const filmTitle = sample('Gecenin Kıyısında', 'Edge of Tonight');

type ScreenId = 'S10' | 'S19' | 'S20' | 'S21' | 'S22' | 'S23';
type FixtureVariant =
  | 'default'
  | 'failed'
  | 'empty'
  | 'loading'
  | 'offline'
  | 'alone'
  | 'ptt'
  | 'dm'
  | 'camera_off'
  | 'no_device'
  | 'focus'
  | 'denied'
  | 'system_audio_unavailable'
  | 'viewer'
  | 'request'
  | 'request_sent'
  | 'handover'
  | 'source_closed'
  | 'active'
  | 'forbidden';

function normalizeScreenId(id: string): ScreenId | null {
  const normalized = id
    .trim()
    .toUpperCase()
    .replace(/^S?(\d{2})$/, 'S$1');
  return ['S10', 'S19', 'S20', 'S21', 'S22', 'S23'].includes(normalized)
    ? (normalized as ScreenId)
    : null;
}

function normalizeVariant(screen: ScreenId, value: string): FixtureVariant {
  const candidate = (value.trim().toLowerCase() || 'default') as FixtureVariant;
  const allowed: Record<ScreenId, readonly FixtureVariant[]> = {
    S10: ['default', 'failed', 'empty', 'loading', 'offline'],
    S19: ['default', 'empty', 'alone', 'ptt', 'offline', 'dm'],
    S20: ['default', 'camera_off', 'no_device', 'focus', 'dm'],
    S21: ['default', 'denied', 'system_audio_unavailable'],
    S22: ['default', 'viewer', 'request', 'request_sent', 'handover', 'source_closed'],
    S23: ['default', 'active', 'forbidden'],
  };
  if (!allowed[screen].includes(candidate))
    throw new Error(`Unsupported ${screen} media fixture variant: ${value}`);
  return candidate;
}

function emptyDiagnostics(): MediaSnapshot['diagnostics'] {
  return { bitrate: null, packetLoss: null, rtt: null };
}

function makeParticipant(
  id: string,
  overrides: Partial<MediaSnapshot['participants'][number]> = {},
): MediaSnapshot['participants'][number] {
  const person = personRecords.find((candidate) => candidate.id === id);
  return {
    id,
    name: person?.name ?? id,
    local: id === 'demo-deniz',
    muted: id === 'demo-can' || id === 'demo-zeynep' || id === 'demo-mert',
    speaking: id === 'demo-ece',
    camera: false,
    screen: false,
    volume: id === 'demo-ece' ? 0.8 : 1,
    quality: 'excellent',
    ...overrides,
  };
}

function artworkForParticipant(participantId: string): string | null {
  const name = personRecords
    .find((person) => person.id === participantId)
    ?.id.slice('demo-'.length);
  return name ? `/__reference/01_brand/avatar-${name}.svg` : null;
}

function createVideoStream(imagePath?: string | null): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const context = canvas.getContext('2d');
  let requestFrame = () => {};
  if (context) {
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#343248');
    gradient.addColorStop(0.56, '#655b78');
    gradient.addColorStop(1, '#253b3c');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(192, 181, 255, 0.2)';
    context.beginPath();
    context.arc(760, 125, 220, 0, Math.PI * 2);
    context.fill();
    if (imagePath) {
      const image = new Image();
      image.onload = () => {
        if (imagePath === artwork) {
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
        } else {
          const diameter = 430;
          context.save();
          context.beginPath();
          context.arc(canvas.width / 2, canvas.height / 2, diameter / 2, 0, Math.PI * 2);
          context.clip();
          context.drawImage(
            image,
            (canvas.width - diameter) / 2,
            (canvas.height - diameter) / 2,
            diameter,
            diameter,
          );
          context.restore();
        }
        requestFrame();
      };
      image.src = imagePath;
    }
  }
  try {
    // These local-only fixture images are static. Manual frame requests make the
    // completed SVG draw visible without generating a continuous fake camera feed.
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
    if (track && 'requestFrame' in track) requestFrame = () => track.requestFrame();
    requestFrame();
    return stream;
  } catch {
    return new MediaStream();
  }
}

function makeSnapshot(screen: ScreenId, variant: FixtureVariant): MediaSnapshot {
  let participantIds = personRecords.map((person) => person.id);
  let status: MediaSnapshot['status'] = 'connected';
  let error: string | null = null;
  let muted = false;
  let cameraUnavailable = false;

  if (screen === 'S10')
    participantIds = personRecords.filter((p) => p.id !== 'demo-mert').map((p) => p.id);
  if (screen === 'S19') {
    if (variant === 'empty') {
      participantIds = [];
      status = 'not-configured';
    }
    if (variant === 'alone') participantIds = ['demo-deniz'];
    if (variant === 'offline') status = 'reconnecting';
  }
  if (screen === 'S20') {
    cameraUnavailable = variant === 'no_device';
    if (cameraUnavailable)
      error = 'Demo fixture: no camera device is available; no hardware was queried.';
  }
  if (
    screen === 'S22' &&
    ['handover', 'request', 'request_sent', 'source_closed'].includes(variant)
  ) {
    participantIds = personRecords.map((person) => person.id);
  }

  const participants = participantIds.map((id) => {
    const overrides: Partial<MediaSnapshot['participants'][number]> = {};
    if (screen === 'S19' && ['demo-zeynep', 'demo-mert'].includes(id)) overrides.muted = false;
    if (screen === 'S19' && (variant === 'empty' || variant === 'alone'))
      overrides.speaking = false;
    if (screen === 'S20') {
      const camera =
        ['demo-ece', 'demo-zeynep'].includes(id) ||
        (id === 'demo-deniz' && !['camera_off', 'no_device', 'dm'].includes(variant));
      overrides.camera = camera;
      if (id === 'demo-zeynep') overrides.muted = false;
    }
    if (screen === 'S22' && ['viewer', 'request_sent'].includes(variant) && id === 'demo-ece')
      overrides.screen = true;
    if (screen === 'S22' && ['default', 'request'].includes(variant) && id === 'demo-deniz')
      overrides.screen = true;
    return makeParticipant(id, overrides);
  });

  const tracks: MediaSnapshot['tracks'] = [];
  if (screen === 'S20') {
    for (const participant of participants) {
      if (participant.camera)
        tracks.push({
          id: `demo-camera-${participant.id}`,
          participantId: participant.id,
          source: 'camera',
          kind: 'video',
          local: participant.local,
          muted: false,
        });
    }
  }
  const presenting =
    screen === 'S22' && ['default', 'viewer', 'request', 'request_sent'].includes(variant);
  if (presenting) {
    const presenterId = ['viewer', 'request_sent'].includes(variant) ? 'demo-ece' : 'demo-deniz';
    tracks.push({
      id: `demo-screen-${presenterId}`,
      participantId: presenterId,
      source: 'screen_share',
      kind: 'video',
      local: presenterId === 'demo-deniz',
      muted: false,
    });
  }

  return {
    status,
    roomId,
    error,
    muted,
    deafened: false,
    camera: screen === 'S20' && !cameraUnavailable && variant !== 'camera_off',
    sharing: screen === 'S22' && ['default', 'request'].includes(variant),
    audioBlocked: false,
    participants,
    tracks,
    diagnostics: emptyDiagnostics(),
  };
}

/** In-memory media adapter. Generated canvas tracks are local previews, never devices or network media. */
class FixtureMedia implements RealtimeMediaProvider {
  private listeners = new Set<() => void>();
  private streams = new Map<string, MediaStream>();
  private readonly initial: MediaSnapshot;
  private value: MediaSnapshot;
  private cameraUnavailable: boolean;
  private addLocalParticipantOnJoin: boolean;

  constructor(
    initial: MediaSnapshot,
    cameraUnavailable = false,
    addLocalParticipantOnJoin = false,
  ) {
    this.initial = initial;
    this.value = initial;
    this.cameraUnavailable = cameraUnavailable;
    this.addLocalParticipantOnJoin = addLocalParticipantOnJoin;
    for (const track of initial.tracks)
      this.streams.set(
        track.id,
        createVideoStream(
          track.source === 'screen_share' ? artwork : artworkForParticipant(track.participantId),
        ),
      );
  }

  get status() {
    return this.value.status;
  }
  snapshot = () => this.value;
  subscribeState = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private patch(value: Partial<MediaSnapshot>) {
    this.value = { ...this.value, ...value };
    this.listeners.forEach((listener) => listener());
  }

  private addTrack(participantId: string, source: 'camera' | 'screen_share') {
    const id = `demo-${source}-${participantId}`;
    if (this.value.tracks.some((track) => track.id === id)) return;
    this.streams.set(
      id,
      createVideoStream(source === 'screen_share' ? artwork : artworkForParticipant(participantId)),
    );
    this.patch({
      tracks: [
        ...this.value.tracks,
        {
          id,
          participantId,
          source,
          kind: 'video',
          local: participantId === 'demo-deniz',
          muted: false,
        },
      ],
      participants: this.value.participants.map((person) =>
        person.id === participantId
          ? { ...person, [source === 'camera' ? 'camera' : 'screen']: true }
          : person,
      ),
      ...(source === 'camera' && participantId === 'demo-deniz' ? { camera: true } : {}),
      ...(source === 'screen_share' && participantId === 'demo-deniz' ? { sharing: true } : {}),
    });
  }

  private removeTracks(source: 'camera' | 'screen_share', participantId?: string) {
    const removed = this.value.tracks.filter(
      (track) =>
        track.source === source && (!participantId || track.participantId === participantId),
    );
    for (const track of removed) {
      this.streams
        .get(track.id)
        ?.getTracks()
        .forEach((mediaTrack) => mediaTrack.stop());
      this.streams.delete(track.id);
    }
    this.patch({
      tracks: this.value.tracks.filter((track) => !removed.some((item) => item.id === track.id)),
      participants: this.value.participants.map((person) =>
        !participantId || person.id === participantId
          ? { ...person, [source === 'camera' ? 'camera' : 'screen']: false }
          : person,
      ),
      ...(source === 'camera' ? { camera: false } : {}),
      ...(source === 'screen_share' ? { sharing: false } : {}),
    });
  }

  async connectRoom(id: string) {
    if (id !== roomId)
      throw new Error(
        'Development fixture only supports the local demo room. No server connection was attempted.',
      );
    this.streams.clear();
    for (const track of this.initial.tracks)
      this.streams.set(
        track.id,
        createVideoStream(
          track.source === 'screen_share' ? artwork : artworkForParticipant(track.participantId),
        ),
      );
    const initial = this.initial;
    const joined = this.addLocalParticipantOnJoin
      ? { ...initial, participants: [makeParticipant('demo-deniz')] }
      : initial;
    this.patch({ ...joined, roomId: id, status: 'connected', error: null });
  }
  async publishMic() {
    await this.mute(false);
  }
  async setNoiseSuppression() {
    /* No physical microphone exists in this fixture. */
  }
  async playSoundboard() {
    throw new Error('Local reference fixture does not produce or transmit audio.');
  }
  stopSoundboard() {
    /* No audio resources are created. */
  }
  async publishCamera(enabled: boolean) {
    if (enabled && this.cameraUnavailable)
      throw new Error('Camera is unavailable in this fixture; no device was queried.');
    if (enabled) this.addTrack('demo-deniz', 'camera');
    else this.removeTracks('camera', 'demo-deniz');
  }
  async publishScreen() {
    if (this.value.tracks.some((track) => track.source === 'screen_share' && !track.local)) {
      throw new Error(
        'A sample participant is presenting. Handover and remote source control are not implemented in this fixture.',
      );
    }
    this.addTrack('demo-deniz', 'screen_share');
  }
  async stopScreen() {
    this.removeTracks('screen_share', 'demo-deniz');
  }
  async subscribe(participantId: string) {
    const tracks = this.value.tracks
      .filter((track) => track.participantId === participantId)
      .flatMap((track) => this.streams.get(track.id)?.getTracks() ?? []);
    return new MediaStream(tracks);
  }
  attachTrack(id: string, element: HTMLMediaElement) {
    const stream = this.streams.get(id);
    if (!stream) throw new Error('This local demo preview is no longer available.');
    element.srcObject = stream;
    element.muted = true;
    return () => {
      if (element.srcObject === stream) element.srcObject = null;
    };
  }
  async deviceSelection(inputId: string, outputId: string) {
    if (inputId || outputId)
      throw new Error(
        'Device selection is unavailable in this local fixture; no hardware was accessed.',
      );
  }
  participantState() {
    return this.value.participants;
  }
  diagnostics() {
    return this.value.diagnostics;
  }
  async mute(muted: boolean) {
    this.patch({
      muted,
      participants: this.value.participants.map((person) =>
        person.local ? { ...person, muted, speaking: false } : person,
      ),
    });
  }
  async deafen(deafened: boolean) {
    this.patch({ deafened });
  }
  setParticipantVolume(id: string, volume: number) {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1)
      throw new Error('Volume must be between 0 and 1.');
    this.patch({
      participants: this.value.participants.map((person) =>
        person.id === id ? { ...person, volume } : person,
      ),
    });
  }
  async startAudio() {
    this.patch({ audioBlocked: false });
  }
  async disconnect() {
    for (const stream of this.streams.values()) stream.getTracks().forEach((track) => track.stop());
    this.streams.clear();
    this.patch({
      status: 'not-configured',
      roomId: null,
      participants: [],
      tracks: [],
      muted: true,
      camera: false,
      sharing: false,
      error: null,
    });
  }
  async reconnect() {
    if (this.value.status !== 'reconnecting')
      throw new Error('This fixture has no transient reconnect operation.');
    this.patch({ status: 'connected', error: null });
  }
}

function makeRoom(screen: ScreenId, variant: FixtureVariant): RoomSnapshot {
  const participants = personRecords
    .filter((person) => screen !== 'S10' || person.id !== 'demo-mert')
    .map((person) => ({
      userId: person.id,
      displayName: person.name,
      joinedAt: 0,
      lastSeenAt: 0,
      canControl: !(screen === 'S23' && variant === 'forbidden' && person.id === 'demo-deniz'),
    }));
  let primary: RoomSnapshot['primary'] = null;
  if (screen === 'S10')
    primary = {
      activity: 'cinema',
      title: filmTitle,
      hostUserId: 'demo-ece',
      startedAt: 0,
      state: 'live',
    };
  if (screen === 'S19')
    primary = {
      activity: 'cinema',
      title: filmTitle,
      hostUserId: 'demo-ece',
      startedAt: 0,
      state: 'live',
    };
  if (screen === 'S20')
    primary = {
      activity: 'cinema',
      title: filmTitle,
      hostUserId: 'demo-ece',
      startedAt: 0,
      state: 'live',
    };
  if (screen === 'S23' && ['active', 'forbidden'].includes(variant))
    primary = {
      activity: 'cinema',
      title: filmTitle,
      hostUserId: 'demo-ece',
      startedAt: 0,
      state: 'live',
    };
  if (screen === 'S22') {
    const viewer = ['viewer', 'request_sent', 'handover', 'source_closed'].includes(variant);
    primary = {
      activity: 'cinema',
      title: filmTitle,
      hostUserId: viewer ? 'demo-ece' : 'demo-deniz',
      startedAt: 0,
      state: 'live',
    };
  }
  const positionSec = screen === 'S23' && variant === 'active' ? 34 * 60 + 28 : 420;
  return {
    roomId,
    revision: 1,
    participants,
    primary,
    timeline: {
      playing: false,
      positionSec,
      rate: 1,
      effectiveServerTimeMs: serverTimeMs,
      epoch: 1,
      itemId: null,
    },
    queue: [],
    cinema:
      screen === 'S10' || (screen === 'S23' && variant === 'active')
        ? {
            itemId: 'demo-film',
            timelineEpoch: 1,
            referenceId: 'demo-film',
            durationSec: 5400,
            sources: participants
              .filter((p) => p.userId !== 'demo-deniz')
              .map((p) => ({
                userId: p.userId,
                sourceVersion: '00000000-0000-4000-8000-000000000001',
                durationSec: 5400,
                ready: true,
                updatedAt: serverTimeMs,
              })),
          }
        : null,
    polls: [],
    whiteboard: [],
  };
}

function unsupportedActivityCommand(command: ActivityCommand): Error {
  const name = command.type;
  if (name === 'start' && command.activity === 'screen')
    return new Error(
      'Screen-share request, approval, and handover are not supported by the local fixture; source selection stays on the presenter device.',
    );
  return new Error(
    `Activity command “${name}” is not implemented by this local reference fixture.`,
  );
}

/** Install only explicit, local development snapshots; no native bridge or account is emulated. */
export function installMediaFixture(id: string, value: string): () => void {
  const screen = normalizeScreenId(id);
  if (!screen) throw new Error(`Unsupported media fixture screen: ${id}`);
  const variant = normalizeVariant(screen, value);
  const previousContext = useVoiceContext.getState();
  const previousPushToTalk = useRooms.getState().preferences.pushToTalk;
  const initial = makeSnapshot(screen, variant);
  const transport = new FixtureMedia(
    initial,
    screen === 'S20' && variant === 'no_device',
    screen === 'S19' && variant === 'empty',
  );
  let room = makeRoom(screen, variant);
  const fixtureLease = '10000000-0000-4000-8000-000000000022';
  const fixtureRequest = '20000000-0000-4000-8000-000000000022';
  let screenState: ScreenPresenterState = { presenter: null, requests: [], reservation: null };
  if (screen === 'S22') {
    if (['default', 'request'].includes(variant))
      screenState.presenter = { userId: 'demo-deniz', leaseId: fixtureLease };
    if (['viewer', 'request_sent', 'source_closed'].includes(variant))
      screenState.presenter = { userId: 'demo-ece', leaseId: fixtureLease };
    if (variant === 'request')
      screenState.requests = [
        {
          requestId: fixtureRequest,
          userId: 'demo-ece',
          leaseId: fixtureLease,
          createdAt: serverTimeMs - 15000,
          expiresAt: serverTimeMs + 45000,
        },
      ];
    if (variant === 'request_sent')
      screenState.requests = [
        {
          requestId: fixtureRequest,
          userId: 'demo-deniz',
          leaseId: fixtureLease,
          createdAt: serverTimeMs - 15000,
          expiresAt: serverTimeMs + 45000,
        },
      ];
    if (variant === 'handover')
      screenState.reservation = {
        requestId: fixtureRequest,
        userId: 'demo-ece',
        leaseId: fixtureLease,
        expiresAt: serverTimeMs + 25000,
        released: true,
      };
  }
  const fixtureCaptureSources = [
    {
      id: 'window:fixture-cinema',
      name: sample('Cinema · önizleme penceresi', 'Cinema · preview window'),
      thumbnail: artwork,
    },
    {
      id: 'screen:fixture-desktop',
      name: sample('Ekran 1 · Yerel demo', 'Screen 1 · Local demo'),
      thumbnail: artwork,
    },
  ];
  const response = (): ActivityResponse => ({
    protocolVersion: 1,
    serverTimeMs,
    room,
    events: [],
    replayRequired: false,
  });
  const activityBridge: DesktopBridge['activity'] = {
    snapshot: async () => response(),
    command: async (_id, envelope) => {
      const command = envelope.command;
      if (command.type === 'join') {
        if (!room.participants.some((person) => person.userId === 'demo-deniz'))
          room = {
            ...room,
            participants: [
              ...room.participants,
              {
                userId: 'demo-deniz',
                displayName: people.deniz,
                joinedAt: 0,
                lastSeenAt: 0,
                canControl: screen !== 'S23' || variant !== 'forbidden',
              },
            ],
          };
      } else if (command.type === 'leave') {
        room = {
          ...room,
          participants: room.participants.filter((person) => person.userId !== 'demo-deniz'),
        };
      } else if (command.type === 'end') {
        room = { ...room, primary: null };
      } else if (command.type === 'start') {
        if (command.activity === 'screen') throw unsupportedActivityCommand(command);
        room = {
          ...room,
          primary: {
            activity: command.activity,
            title: command.title,
            hostUserId: 'demo-deniz',
            startedAt: 0,
            state: 'live',
          },
        };
      } else if (command.type === 'playback') {
        room = {
          ...room,
          timeline: { ...room.timeline, ...command, effectiveServerTimeMs: serverTimeMs },
        };
      } else {
        throw unsupportedActivityCommand(command);
      }
      room = { ...room, revision: room.revision + 1 };
      return response();
    },
    exportBoard: async () => {
      throw new Error('Whiteboard export is not available in this fixture.');
    },
    youtubePlaylist: async () => {
      throw new Error('Playlist import is unavailable in the visual fixture.');
    },
    youtubePlayer: async () => {
      throw new Error('YouTube playback is not simulated; no player service is called.');
    },
  };
  const mediaBridge: DesktopBridge['media'] = {
    grant: async (channelId) => {
      if (channelId !== roomId)
        throw new Error('Development fixture only supports the local demo room.');
      return { serverUrl: '', roomName: roomId, token: '', expiresAt: '' };
    },
    presenter: async (channelId, action) => {
      if (channelId !== roomId)
        throw new Error('Development fixture only supports the local demo room.');
      if (action === 'acquire') {
        if (
          screen === 'S22' &&
          screenState.reservation &&
          (screenState.reservation.userId !== 'demo-deniz' || !screenState.reservation.released)
        )
          throw new Error(
            'This demo reservation belongs to another presenter or is still waiting for release.',
          );
        if (screenState.presenter && screenState.presenter.userId !== 'demo-deniz')
          throw new Error('The local demo presenter is read-only.');
        const presenter = { userId: 'demo-deniz', leaseId: crypto.randomUUID() };
        screenState = { ...screenState, presenter, reservation: null };
        return { granted: true as const, leaseId: presenter.leaseId };
      }
      if (screenState.presenter?.userId === 'demo-deniz') {
        const releasedLease = screenState.presenter.leaseId;
        screenState = {
          ...screenState,
          presenter: null,
          requests: [],
          reservation:
            screenState.reservation?.leaseId === releasedLease
              ? { ...screenState.reservation, released: true }
              : screenState.reservation,
        };
      }
      return { released: true as const };
    },
    screenState: async (channelId) => {
      if (channelId !== roomId || screen !== 'S22')
        throw new Error('Presenter state is only available in the local S22 handoff fixture.');
      return structuredClone(screenState);
    },
    requestScreen: async (channelId, leaseId, requestId) => {
      if (channelId !== roomId || screen !== 'S22')
        throw new Error('Presenter requests are only available in the local S22 handoff fixture.');
      if (
        !screenState.presenter ||
        screenState.presenter.leaseId !== leaseId ||
        screenState.presenter.userId === 'demo-deniz'
      )
        throw new Error('The sample presenter cannot receive this request.');
      if (screenState.requests.some((request) => request.userId === 'demo-deniz'))
        throw new Error('Your sample presenter request is already pending.');
      const request = {
        requestId,
        userId: 'demo-deniz',
        leaseId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000,
      };
      screenState = { ...screenState, requests: [...screenState.requests, request] };
      return { request };
    },
    cancelScreenRequest: async (channelId, leaseId, requestId) => {
      if (channelId !== roomId || screen !== 'S22')
        throw new Error('Presenter requests are only available in the local S22 handoff fixture.');
      if (
        screenState.reservation?.requestId === requestId &&
        screenState.reservation.userId === 'demo-deniz'
      )
        screenState = { ...screenState, reservation: null };
      else {
        const request = screenState.requests.find(
          (item) =>
            item.requestId === requestId &&
            item.userId === 'demo-deniz' &&
            item.leaseId === leaseId,
        );
        if (!request) throw new Error('The sample presenter request is no longer available.');
        screenState = {
          ...screenState,
          requests: screenState.requests.filter((item) => item !== request),
        };
      }
      return { cancelled: true as const };
    },
    decideScreenRequest: async (channelId, leaseId, requestId, approve) => {
      if (
        channelId !== roomId ||
        screen !== 'S22' ||
        screenState.presenter?.userId !== 'demo-deniz' ||
        screenState.presenter.leaseId !== leaseId
      )
        throw new Error('Only the local sample presenter can decide this request.');
      const request = screenState.requests.find((item) => item.requestId === requestId);
      if (!request) throw new Error('The sample presenter request expired.');
      screenState = {
        ...screenState,
        requests: screenState.requests.filter((item) => item !== request),
        reservation: approve ? { ...request, released: false } : null,
      };
      return { approved: approve, awaitingRelease: approve };
    },
    leave: async (channelId) => {
      if (channelId !== roomId)
        throw new Error('Development fixture only supports the local demo room.');
    },
    captureSources: async () =>
      screen === 'S21' && variant === 'denied' ? [] : fixtureCaptureSources,
    selectCaptureSource: async (sourceId) => {
      if (screen === 'S21' && variant === 'denied')
        throw new Error(
          'Screen permission is marked denied in this fixture; no system dialog was opened.',
        );
      if (!fixtureCaptureSources.some((source) => source.id === sourceId))
        throw new Error('Choose a listed local demo source.');
    },
    clearCaptureSource: async () => {},
    captureStatus: async () => ({
      microphone: 'not-determined',
      camera: screen === 'S20' && variant === 'no_device' ? 'not-found' : 'not-determined',
      screen: screen === 'S21' && variant === 'denied' ? 'denied' : 'not-determined',
      systemAudio: false,
    }),
  };
  const restoreRuntime = installDevelopmentRuntime({
    mediaProvider: transport,
    activityBridge,
    mediaBridge,
  });
  if (screen === 'S19' && variant === 'empty')
    useVoiceContext.setState({ channelId: null, roomName: null, error: null, busy: false });
  else
    useVoiceContext.setState({
      channelId: roomId,
      roomName: places.lounge,
      error: null,
      busy: false,
    });
  useRooms.setState((state) => ({
    preferences: {
      ...state.preferences,
      pushToTalk: screen === 'S19' && variant === 'ptt' ? true : previousPushToTalk,
    },
  }));
  return () => {
    restoreRuntime();
    void transport.disconnect();
    useVoiceContext.setState(previousContext, true);
    useRooms.setState((state) => ({
      preferences: { ...state.preferences, pushToTalk: previousPushToTalk },
    }));
  };
}
