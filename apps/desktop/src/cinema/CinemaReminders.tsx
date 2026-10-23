import './cinema-reminders.css';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Play, X } from 'lucide-react';
import { t } from '../i18n';
import { hhmm } from './hall-model';
import { requestHallOpen, takeDue, type Reminder } from './reminders';
import { useCommunity } from '../community';

/**
 * Programme reminders, wherever the app is: when one starts, the system notification and a
 * card with "Salonda aç". Mounted once in the shell.
 */
export function CinemaReminders() {
  const navigate = useNavigate();
  const [shown, setShown] = useState<Reminder[]>([]);
  useEffect(() => {
    const check = () => {
      const due = takeDue(Date.now());
      if (!due.length) return;
      setShown((current) => [...current, ...due].slice(-3));
      for (const reminder of due) {
        // The renderer cannot show OS notifications in Electron; the main process does.
        void window.rooms?.notifications
          ?.reminder?.({
            title: t('{title} başladı', { title: reminder.title }).slice(0, 200),
            detail: `${reminder.channel} · ${hhmm(reminder.start)}`.slice(0, 200),
          })
          .catch(() => {
            // The card below says it anyway.
          });
      }
    };
    check();
    const timer = setInterval(check, 15_000);
    return () => clearInterval(timer);
  }, []);
  if (!shown.length) return null;
  const dismiss = (reminder: Reminder) =>
    setShown((current) => current.filter((value) => value !== reminder));
  return (
    <div className="cinema-reminders" role="status" aria-live="polite">
      {shown.map((reminder) => (
        <div key={`${reminder.ref}:${reminder.start}`} className="cinema-reminder">
          <Bell size={16} />
          <span>
            <strong>{reminder.title}</strong>
            <small>
              {t('{channel} · {time}’da başladı', {
                channel: reminder.channel,
                time: hhmm(reminder.start),
              })}
            </small>
          </span>
          <button
            className="button primary small"
            onClick={() => {
              dismiss(reminder);
              void (async () => {
                // The hall page shows the active community's hall: switch to this one first.
                const community = useCommunity.getState();
                if (reminder.communityId && community.activeSpaceId !== reminder.communityId)
                  await community.openSpace(reminder.communityId).catch(() => {});
                requestHallOpen(reminder.hallId, reminder.ref);
                navigate('/cinema');
              })();
            }}
          >
            <Play size={14} />
            {t('Salonda aç')}
          </button>
          {window.rooms?.social && (
            <button
              className="button secondary small"
              title={t('Salon sohbetine senin adınla yazar')}
              onClick={() => {
                dismiss(reminder);
                void window
                  .rooms!.social.send(
                    reminder.hallId,
                    t('{title} başladı ({channel}). Salonda birlikte izleyelim mi?', {
                      title: reminder.title,
                      channel: reminder.channel,
                    }),
                    [],
                  )
                  .catch(() => {});
              }}
            >
              {t('Salona duyur')}
            </button>
          )}
          <button
            className="cinema-reminder-close"
            aria-label={t('Kapat')}
            onClick={() => dismiss(reminder)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
