import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton } from '@rooms/design';
import { CircleArrowUp } from 'lucide-react';
import { t } from './i18n';

type UpdateStatus = Awaited<ReturnType<NonNullable<Window['rooms']>['updates']['status']>>;
const POLL_MS = 60_000;

/** The release the native updater found or already downloaded, or null while there is none. */
export function useWaitingUpdate() {
  const [waiting, setWaiting] = useState<UpdateStatus | null>(null);
  useEffect(() => {
    const updates = window.rooms?.updates;
    if (!updates || new URLSearchParams(location.search).has('fixture')) return;
    let active = true;
    const read = () =>
      void updates
        .status()
        .then((status) => {
          if (!active) return;
          const found = status.enabled && ['available', 'ready'].includes(status.state);
          setWaiting(found ? status : null);
        })
        .catch(() => {
          /* The notice is a hint; the settings page reports update errors. */
        });
    read();
    const timer = setInterval(read, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return waiting;
}

/** A glowing button beside Settings that opens the restart-and-update prompt. */
export function UpdateNotice() {
  const waiting = useWaitingUpdate(),
    navigate = useNavigate();
  if (!waiting) return null;
  const label = waiting.version
    ? t('Tayfa {version} hazır, güncellemek için tıkla', { version: waiting.version })
    : t('Yeni sürüm hazır, güncellemek için tıkla');
  return (
    <IconButton
      label={label}
      className="update-notice"
      onClick={() => navigate('/settings?tab=about&install=1')}
    >
      <CircleArrowUp size={17} />
    </IconButton>
  );
}
