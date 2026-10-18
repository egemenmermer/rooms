import { z } from 'zod';

/**
 * Personal entrance/leave sounds ("Giriş sesi").
 *
 * The access service stamps the sound a person chose onto their LiveKit token as server-owned
 * participant attributes. Clients read the attribute of the participant that joined or left and
 * play that sound locally; nothing travels through the microphone or a data channel.
 */
export const PERSONAL_SOUND_EVENTS = ['enter', 'leave'] as const;
export type PersonalSoundEvent = (typeof PERSONAL_SOUND_EVENTS)[number];
export const PERSONAL_SOUND_ATTRIBUTES: Record<PersonalSoundEvent, string> = {
  enter: 'rooms.sound.enter',
  leave: 'rooms.sound.leave',
};

export const PERSONAL_SOUND_LIMITS = {
  sampleRate: 48000,
  /** Longest stored clip after trimming. */
  maxDurationSec: 4,
  /** Server tolerance for encoder rounding on top of `maxDurationSec`. */
  acceptDurationSec: 4.05,
  /** Uploaded sounds a person can keep. */
  maxSounds: 6,
  /** Source files are decoded on the device and never uploaded. */
  maxSourceBytes: 20_000_000,
  /** Decoded sources are held while a window is chosen; longer files would cost hundreds of MB. */
  maxSourceDurationSec: 300,
  /** Canonical mono PCM16 WAV at `acceptDurationSec`. */
  maxClipBytes: 44 + Math.ceil(4.05 * 48000) * 2,
  maxNameLength: 40,
} as const;
/** Base64 length of `maxClipBytes`. */
export const PERSONAL_SOUND_MAX_BASE64 = Math.ceil(PERSONAL_SOUND_LIMITS.maxClipBytes / 3) * 4;

/** Loudness targets shared by device previews and the authoritative server pass. */
export const PERSONAL_SOUND_LOUDNESS = {
  targetLufs: -20,
  maxBoostDb: 12,
  peakCeilingDbfs: -3,
  silenceLufs: -50,
  /** Leading and trailing samples below this are trimmed (at most `maxLeadingTrimSec` at the start). */
  trimThresholdDbfs: -50,
  maxLeadingTrimSec: 1,
  fadeInSec: 0.005,
  fadeOutSec: 0.03,
  minDurationSec: 0.05,
} as const;

/** Listener-side anti-spam policy; the iPhone port mirrors these numbers exactly. */
export const PERSONAL_SOUND_POLICY = {
  /** A departure waits this long; the same person returning inside it silences both events. */
  leaveHoldMs: 1500,
  /** Returning within this window after leaving plays the classic cue instead of the personal one. */
  rejoinClassicMs: 30_000,
  /** Leaving within this window after joining plays the classic cue. */
  shortStayClassicMs: 10_000,
  /** At most one personal sound per person and event in this window. */
  perPersonCooldownMs: 120_000,
  /** At most one personal sound per listener in this window; longer than the longest clip, so clips never overlap. */
  roomWindowMs: 5_000,
  /** Classic cues closer together than this collapse into one. */
  classicCoalesceMs: 400,
  /** A personal sound that is not ready this long after the event is dropped for the classic cue. */
  readyDeadlineMs: 1_500,
  /** Playback gain before the listener's effects level. */
  personalGain: 0.45,
  classicGain: 0.55,
} as const;

export const PERSONAL_SOUND_PRESETS = [
  { id: 'p.fanfar', name: 'Fanfar' },
  { id: 'p.kapi', name: 'Kapı zili' },
  { id: 'p.arcade', name: 'Arcade' },
  { id: 'p.portal', name: 'Portal' },
  { id: 'p.damla', name: 'Damla' },
  { id: 'p.kristal', name: 'Kristal' },
  { id: 'p.kapanis', name: 'Kapanış' },
  { id: 'p.hoscakal', name: 'Hoşça kal' },
] as const;
export type PersonalSoundPresetId = (typeof PERSONAL_SOUND_PRESETS)[number]['id'];

const userId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const uploadedSoundIdSchema = z.string().uuid();
/** Clients accept any well-formed preset id, so new server presets need no client update. */
export const presetSoundIdSchema = z.string().regex(/^p\.[a-z0-9-]{1,32}$/);
export const personalSoundIdSchema = z.union([uploadedSoundIdSchema, presetSoundIdSchema]);
export const isPersonalSoundId = (value: unknown): value is string =>
  personalSoundIdSchema.safeParse(value).success;
export const personalSoundUserIdSchema = userId;

export const personalSoundSchema = z
  .object({
    id: uploadedSoundIdSchema,
    name: z.string().min(1).max(PERSONAL_SOUND_LIMITS.maxNameLength),
    durationSec: z.number().positive().max(PERSONAL_SOUND_LIMITS.acceptDurationSec),
  })
  .strict();
export const personalSoundPresetSchema = z
  .object({
    id: presetSoundIdSchema,
    name: z.string().min(1).max(PERSONAL_SOUND_LIMITS.maxNameLength),
    durationSec: z.number().positive().max(PERSONAL_SOUND_LIMITS.acceptDurationSec),
  })
  .strict();
/** `null` means the classic ROOMS cue. */
export const personalSoundAssignSchema = z
  .object({ enter: personalSoundIdSchema.nullable(), leave: personalSoundIdSchema.nullable() })
  .strict();
export const personalSoundProfileSchema = z
  .object({
    assign: personalSoundAssignSchema,
    sounds: z.array(personalSoundSchema).max(PERSONAL_SOUND_LIMITS.maxSounds),
    presets: z.array(personalSoundPresetSchema).max(32),
    /** False when the instance administrator turned uploads off. */
    uploads: z.boolean(),
  })
  .strict();
export const personalSoundUploadSchema = z
  .object({
    name: z.string().trim().min(1).max(PERSONAL_SOUND_LIMITS.maxNameLength),
    audio: z
      .string()
      .max(PERSONAL_SOUND_MAX_BASE64)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/),
    /** The uploader confirms they may use the clip; stored with a timestamp. */
    rightsAccepted: z.literal(true),
  })
  .strict();

export type PersonalSound = z.infer<typeof personalSoundSchema>;
export type PersonalSoundPreset = z.infer<typeof personalSoundPresetSchema>;
export type PersonalSoundAssign = z.infer<typeof personalSoundAssignSchema>;
export type PersonalSoundProfile = z.infer<typeof personalSoundProfileSchema>;
export type PersonalSoundUpload = z.infer<typeof personalSoundUploadSchema>;

/**
 * Access routes, all under `/rooms-access`:
 * - `GET    /v1/personal-sounds/me` → PersonalSoundProfile
 * - `POST   /v1/personal-sounds/me/sounds` (PersonalSoundUpload) → PersonalSound
 * - `DELETE /v1/personal-sounds/me/sounds/:soundId` → PersonalSoundProfile
 * - `PUT    /v1/personal-sounds/me/assign` (PersonalSoundAssign) → PersonalSoundProfile
 * - `GET    /v1/personal-sounds/me/sounds/:soundId` → audio/wav (own upload or preset)
 * - `GET    /v1/personal-sounds/:channelId/:userId/:soundId` → audio/wav; the caller must be able
 *   to join that voice channel, and the sound must be a preset or belong to `userId`.
 */
export const PERSONAL_SOUND_ERRORS = [
  'PERSONAL_SOUNDS_NOT_CONFIGURED',
  'PERSONAL_SOUND_UPLOADS_DISABLED',
  'PERSONAL_SOUND_INVALID_AUDIO',
  'PERSONAL_SOUND_SILENT',
  'PERSONAL_SOUND_LIBRARY_FULL',
  'PERSONAL_SOUND_STORAGE_LIMIT',
  'PERSONAL_SOUND_NOT_FOUND',
] as const;
export type PersonalSoundError = (typeof PERSONAL_SOUND_ERRORS)[number];

/** Renderer bridge; audio crosses IPC as base64 canonical WAV. */
export interface PersonalSoundsBridge {
  profile(): Promise<PersonalSoundProfile>;
  upload(input: PersonalSoundUpload): Promise<PersonalSound>;
  remove(soundId: string): Promise<PersonalSoundProfile>;
  assign(value: PersonalSoundAssign): Promise<PersonalSoundProfile>;
  /** The caller's own upload or a preset, for settings previews. */
  preview(soundId: string): Promise<string>;
  /** Another participant's sound, authorized by the shared voice channel. */
  read(channelId: string, userId: string, soundId: string): Promise<string>;
}
