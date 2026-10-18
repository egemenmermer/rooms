import { createAccessServer } from './server';
import { personalSoundUploadsEnabled } from './personal-sounds';
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing service configuration: ${name}`);
  return value;
};
async function start() {
  const personalSoundsMegabytes = Number(process.env.ROOMS_PERSONAL_SOUNDS_MAX_MB || 512);
  if (!(personalSoundsMegabytes >= 0))
    throw new Error('Invalid service configuration: ROOMS_PERSONAL_SOUNDS_MAX_MB');
  const server = await createAccessServer({
    soundboardDirectory: process.env.ROOMS_SOUNDBOARD_DIRECTORY ?? '/state/soundboard',
    personalSoundsDirectory:
      process.env.ROOMS_PERSONAL_SOUNDS_DIRECTORY ?? '/state/personal-sounds',
    personalSoundUploads: personalSoundUploadsEnabled(process.env.ROOMS_PERSONAL_SOUND_UPLOADS),
    personalSoundsMaxBytes: personalSoundsMegabytes * 1024 * 1024,
    musicPlaylistsDirectory:
      process.env.ROOMS_MUSIC_PLAYLISTS_DIRECTORY ?? '/state/music-playlists',
    musicName: process.env.ROOMS_MUSIC_NAME,
    musicUrl: process.env.ROOMS_MUSIC_URL,
    musicSecret: process.env.ROOMS_MUSIC_SECRET,
    stoatUrl: process.env.STOAT_INTERNAL_URL ?? 'http://127.0.0.1:3022',
    livekitUrl: process.env.LIVEKIT_INTERNAL_URL ?? 'http://127.0.0.1:7880',
    publicLivekitUrl: process.env.LIVEKIT_PUBLIC_URL ?? 'ws://127.0.0.1:7880',
    registrationInvitesFile: process.env.ROOMS_REGISTRATION_INVITES_FILE,
    accountInviteMongoUrl: process.env.ROOMS_ACCOUNT_INVITE_MONGO_URL,
    socialReadMongoUrl: process.env.ROOMS_SOCIAL_READ_MONGO_URL,
    klipyKey: process.env.ROOMS_KLIPY_KEY || undefined,
    apiKey: required('LIVEKIT_API_KEY'),
    apiSecret: required('LIVEKIT_API_SECRET'),
  });
  await server.listen({
    port: Number(process.env.PORT ?? 3002),
    host: process.env.SERVICE_HOST ?? '127.0.0.1',
  });
  console.log('ROOMS access service listening. Request logging disabled.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void server.close());
}
void start().catch(() => {
  console.error('ROOMS access service failed. Verify configuration and service availability.');
  process.exitCode = 1;
});
