import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Search } from 'lucide-react';
import { t, uiError } from './i18n';
import './composer-pickers.css';

type GifPage = Awaited<ReturnType<NonNullable<NonNullable<Window['rooms']>['media']['gifs']>>>;
export type GifResult = GifPage['items'][number];

/** A GIF from KLIPY's CDN sent as a message; the chat shows it in place. */
export const isGifMessage = (content: string) =>
  /^https:\/\/static\.klipy\.com\/[^\s]+\.(?:gif|webp)$/i.test(content.trim());

/** KLIPY search above the composer; the placeholder is KLIPY's required attribution. */
export function GifPicker({ onPick, onClose }: { onPick(gif: GifResult): void; onClose(): void }) {
  const [query, setQuery] = useState(''),
    [items, setItems] = useState<GifResult[]>([]),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const ticket = useRef(0);
  const load = async (q: string, number: number) => {
    const search = window.rooms?.media.gifs;
    if (!search) {
      setError(t('GIF araması için masaüstü uygulaması gerekiyor.'));
      return;
    }
    const current = ++ticket.current;
    setLoading(true);
    setError('');
    try {
      const result = await search(q, number);
      if (current !== ticket.current) return;
      setItems((list) => (number === 1 ? result.items : [...list, ...result.items]));
      setPage(number);
      setMore(result.more);
    } catch (e) {
      if (current === ticket.current) setError(uiError(e));
    } finally {
      if (current === ticket.current) setLoading(false);
    }
  };
  // Typing waits a moment so each keystroke is not a request.
  useEffect(() => {
    const timer = setTimeout(() => void load(query.trim(), 1), query ? 350 : 0);
    return () => clearTimeout(timer);
  }, [query]);
  return (
    <div className="gif-picker" role="dialog" aria-label={t('GIF seç')}>
      <label className="gif-search">
        <Search size={16} aria-hidden="true" />
        <input
          autoFocus
          aria-label={t('GIF ara')}
          placeholder="Search KLIPY"
          value={query}
          maxLength={80}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              onClose();
            }
          }}
        />
      </label>
      <div
        className="gif-results"
        onScroll={(event) => {
          const box = event.currentTarget;
          if (more && !loading && box.scrollTop + box.clientHeight > box.scrollHeight - 160)
            void load(query.trim(), page + 1);
        }}
      >
        {error ? (
          <p className="gif-note" role="alert">
            {error}
          </p>
        ) : !items.length && !loading ? (
          <p className="gif-note">{t('“{query}” için GIF bulunamadı.', { query: query.trim() })}</p>
        ) : (
          <div className="gif-grid">
            {items.map((item) => (
              <button
                key={item.id}
                aria-label={item.title || 'GIF'}
                title={item.title || undefined}
                onClick={() => onPick(item)}
              >
                <img
                  src={item.preview.url}
                  alt=""
                  loading="lazy"
                  width={item.preview.width}
                  height={item.preview.height}
                />
              </button>
            ))}
          </div>
        )}
        {loading && (
          <p className="gif-note" role="status">
            <LoaderCircle size={16} className="spin" /> {t('GIF’ler yükleniyor…')}
          </p>
        )}
      </div>
      <small className="gif-attribution">Powered by KLIPY</small>
    </div>
  );
}

const emojiGroups: { name: string; emojis: string }[] = [
  {
    name: t('Sık kullanılanlar'),
    emojis: '😂 ❤️ 👍 😭 🔥 🙏 😍 🥲 😅 😎 🤔 👀 🎉 💀 😡 🤝 😊 🙌 💯 🥳',
  },
  {
    name: t('Yüzler'),
    emojis:
      '😀 😃 😄 😁 😆 🤣 🙂 🙃 😉 😇 🥰 😘 😋 😜 🤪 🤨 🧐 🤓 😏 😒 😞 😔 😟 😕 🙁 😣 😫 😩 🥺 😢 😤 😠 🤯 😳 🥵 🥶 😱 😨 😰 🤗 🤭 🤫 😶 😐 😑 😬 🙄 😯 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👻 🤡 💩',
  },
  {
    name: t('Eller'),
    emojis: '👋 🤚 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👎 ✊ 👊 🤛 🤜 👏 👐 🤲 💪 🫶',
  },
  { name: t('Kalpler'), emojis: '🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝' },
  {
    name: t('Etkinlik'),
    emojis: '🎮 🎲 ♠️ ♥️ ♦️ ♣️ 🃏 🎬 🍿 🎵 🎶 🎧 🎤 ⚽ 🏀 🏆 🎂 🎁 🍕 🍺 ☕ 🚀 ✨ ⭐',
  },
];
/** Common emoji inserted at the caret. */
export function EmojiPicker({ onPick, onClose }: { onPick(emoji: string): void; onClose(): void }) {
  return (
    <div
      className="emoji-picker"
      role="dialog"
      aria-label={t('Emoji ekle')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {emojiGroups.map((group) => (
        <section key={group.name}>
          <h3>{group.name}</h3>
          <div>
            {group.emojis.split(' ').map((emoji, index) => (
              <button
                key={emoji}
                aria-label={emoji}
                autoFocus={group === emojiGroups[0] && index === 0}
                onClick={() => onPick(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
