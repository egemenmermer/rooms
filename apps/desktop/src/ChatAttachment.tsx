import { useEffect, useState } from 'react';
import { Download, FileText, LoaderCircle, Play } from 'lucide-react';
import { Modal } from '@rooms/design';
import type { SocialAttachment } from '@rooms/social';
import { useCommunity } from './community';
import { t } from './i18n';

/** Recently shown photos, per account and channel, so reopening a channel does not refetch them. */
const imageCache = new Map<string, string>();
const IMAGE_CACHE_BYTES = 64 * 1024 * 1024;
let imageCacheBytes = 0;
const imageKey = (server: string, user: string | undefined, ...ids: string[]) =>
  [server, user ?? '', ...ids].join('|');
function rememberImage(key: string, value: string) {
  forgetImage(key);
  imageCache.set(key, value);
  imageCacheBytes += value.length;
  for (const [oldest, data] of imageCache) {
    if (imageCacheBytes <= IMAGE_CACHE_BYTES) break;
    imageCache.delete(oldest);
    imageCacheBytes -= data.length;
  }
}
function forgetImage(key: string) {
  const value = imageCache.get(key);
  if (value === undefined) return;
  imageCache.delete(key);
  imageCacheBytes -= value.length;
}
if (typeof window !== 'undefined')
  window.addEventListener('rooms:channel-access-invalidated', (event) => {
    const ids = (event as CustomEvent<{ channelIds?: string[] }>).detail?.channelIds ?? [];
    for (const key of [...imageCache.keys()])
      if (ids.includes(key.split('|')[2]!)) forgetImage(key);
  });
/** Video types the chat plays in place; QuickTime covers Mac recordings and iPhone videos. */
const inlineVideo = ['video/mp4', 'video/webm', 'video/quicktime'];

async function saveAttachment(channelId: string, messageId: string, fileId: string) {
  if (!window.rooms) throw Error(t('Dosya indirmek için masaüstü uygulaması gerekiyor.'));
  await window.rooms.social.downloadAttachment(channelId, messageId, fileId);
}

/** Plays a shared video in the conversation; bytes load only when someone presses play. */
function ChatVideo({
  file,
  channelId,
  messageId,
}: {
  file: SocialAttachment;
  channelId: string;
  messageId: string;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle'),
    [source, setSource] = useState<string | null>(null),
    [saveError, setSaveError] = useState('');
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );
  useEffect(() => {
    setSource(null);
    setState('idle');
  }, [channelId, messageId, file.id]);
  const load = async () => {
    if (!window.rooms) return setState('failed');
    setState('loading');
    try {
      const video = await window.rooms.social.attachmentVideo(channelId, messageId, file.id);
      if (!video) return setState('failed');
      // QuickTime and MP4 share a container; Chromium plays H.264/HEVC .mov files as MP4.
      const type = video.mime === 'video/quicktime' ? 'video/mp4' : video.mime;
      setSource(URL.createObjectURL(new Blob([video.bytes as BlobPart], { type })));
      setState('idle');
    } catch {
      setState('failed');
    }
  };
  const size =
    file.size >= 1_000_000
      ? `${(file.size / 1_000_000).toFixed(1)} MB`
      : `${Math.round(file.size / 1000)} KB`;
  return (
    <div className="chat-video-attachment">
      {source ? (
        <video
          src={source}
          controls
          autoPlay
          playsInline
          aria-label={t('Paylaşılan video')}
          onError={() => {
            setSource(null);
            setState('failed');
          }}
        />
      ) : (
        <button
          className="chat-video-poster"
          aria-label={state === 'loading' ? t('Video yükleniyor') : t('Videoyu oynat')}
          disabled={state === 'loading'}
          onClick={() => void load()}
        >
          <span className="chat-video-play">
            {state === 'loading' ? <LoaderCircle size={26} className="spin" /> : <Play size={26} />}
          </span>
          <small>
            {state === 'failed'
              ? t('Video oynatılamadı. Yeniden dene ya da indir.')
              : t('Video · {size}', { size })}
          </small>
        </button>
      )}
      <button
        className="chat-video-save"
        onClick={() => {
          setSaveError('');
          void saveAttachment(channelId, messageId, file.id).catch(() =>
            setSaveError(t('Video indirilemedi. Bağlantını kontrol edip yeniden dene.')),
          );
        }}
      >
        <Download size={14} />
        {t('İndir')}
      </button>
      {saveError && <p role="alert">{saveError}</p>}
    </div>
  );
}

export function ChatAttachment({
  file,
  channelId,
  messageId,
}: {
  file: SocialAttachment;
  channelId: string;
  messageId: string;
}) {
  const c = useCommunity(),
    key = imageKey(c.serverUrl, c.user?.id, channelId, messageId, file.id),
    [source, setSource] = useState<string | null>(() => imageCache.get(key) ?? null),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0),
    [expanded, setExpanded] = useState(false),
    [downloading, setDownloading] = useState(false),
    [downloadError, setDownloadError] = useState('');
  const image = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.mime);
  useEffect(() => {
    let alive = true;
    const cached = imageCache.get(key);
    setSource(cached ?? null);
    setFailed(false);
    setExpanded(false);
    if (image && !cached && window.rooms)
      void window.rooms.social
        .attachmentImage(channelId, messageId, file.id)
        .then((value) => {
          if (value) rememberImage(key, value);
          if (alive) {
            setSource(value);
            setFailed(!value);
          }
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    return () => {
      alive = false;
    };
  }, [key, channelId, messageId, file.id, image, retry]);
  if (inlineVideo.includes(file.mime))
    return <ChatVideo file={file} channelId={channelId} messageId={messageId} />;
  if (!image)
    return (
      <div>
        <button
          className="message-attachment"
          disabled={downloading}
          onClick={async () => {
            setDownloading(true);
            setDownloadError('');
            try {
              await saveAttachment(channelId, messageId, file.id);
            } catch {
              setDownloadError(
                t('Dosya indirilemedi. Mesaja erişimini ve bağlantını kontrol edip yeniden dene.'),
              );
            } finally {
              setDownloading(false);
            }
          }}
        >
          <FileText size={27} />
          <span>
            <strong>{file.name}</strong>
            <small>{Math.round(file.size / 1024)} KB</small>
          </span>
          <Download size={19} />
        </button>
        {downloadError && <p role="alert">{downloadError}</p>}
      </div>
    );
  return (
    <div className="chat-image-attachment">
      {source ? (
        <button
          className="chat-image-preview"
          aria-label={t('Fotoğrafı büyüt')}
          onClick={() => setExpanded(true)}
        >
          <img
            src={source}
            alt={t('Paylaşılan fotoğraf')}
            onError={() => {
              setSource(null);
              setFailed(true);
            }}
          />
        </button>
      ) : (
        <div className="chat-image-status" role="status">
          {failed ? (
            <>
              <span>{t('Fotoğraf yüklenemedi.')}</span>
              <button onClick={() => setRetry((n) => n + 1)}>{t('Yeniden dene')}</button>
            </>
          ) : (
            <span>{t('Fotoğraf yükleniyor…')}</span>
          )}
        </div>
      )}
      {expanded && source && (
        <Modal
          title={t('Fotoğraf')}
          onClose={() => setExpanded(false)}
          className="chat-image-modal"
        >
          <img src={source} alt={t('Paylaşılan fotoğraf')} />
        </Modal>
      )}
    </div>
  );
}
