import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Modal } from '@rooms/design';
import type { SocialAttachment } from '@rooms/social';
import { useCommunity } from './community';
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
    [source, setSource] = useState<string | null>(null),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0),
    [expanded, setExpanded] = useState(false),
    [downloading, setDownloading] = useState(false),
    [downloadError, setDownloadError] = useState('');
  const image = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.mime);
  useEffect(() => {
    let alive = true;
    setSource(null);
    setFailed(false);
    setExpanded(false);
    if (image && window.rooms)
      void window.rooms.social
        .attachmentImage(channelId, messageId, file.id)
        .then((value) => {
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
  }, [c.serverUrl, c.user?.id, channelId, messageId, file.id, image, retry]);
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
            if (!window.rooms) throw Error('Dosya indirmek için masaüstü uygulaması gerekiyor.');
              await window.rooms.social.downloadAttachment(channelId, messageId, file.id);
            } catch {
              setDownloadError(
                'Dosya indirilemedi. Mesaja erişimini ve bağlantını kontrol edip yeniden dene.',
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
          aria-label={`${file.name} fotoğrafını büyüt`}
          onClick={() => setExpanded(true)}
        >
          <img
            src={source}
            alt={file.name}
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
              <span>Fotoğraf yüklenemedi.</span>
              <button onClick={() => setRetry((n) => n + 1)}>Yeniden dene</button>
            </>
          ) : (
            <span>Fotoğraf yükleniyor…</span>
          )}
        </div>
      )}
      {expanded && source && (
        <Modal title={file.name} onClose={() => setExpanded(false)} className="chat-image-modal">
          <img src={source} alt={file.name} />
        </Modal>
      )}
    </div>
  );
}
