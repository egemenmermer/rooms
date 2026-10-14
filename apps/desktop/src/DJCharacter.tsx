import { useRooms } from './store';
import { useEffect, useState } from 'react';
import { DEFAULT_DJ_IMAGE, fetchBrandingAsset, type CommunityBranding } from './community-branding';

/** Decorative branding never controls playback or carries provider credentials. */
export function DJCharacter({ branding = { name: 'DJ' } }: { branding?: CommunityBranding }) {
  const reduceMotion = useRooms((state) => state.preferences.reduceMotion);
  const [media, setMedia] = useState<{ poster?: string; animation?: string }>({});
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const urls: string[] = [];
    setMedia({});
    setFailed(false);
    const load = async (url: string | undefined, type: 'poster' | 'animation', limit: number) => {
      if (!url) return;
      try {
        const blob = await fetchBrandingAsset(
          url,
          AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
          limit,
        );
        if (
          !(type === 'poster' ? /^image\/(png|webp|jpeg|avif)$/ : /^video\/(webm|mp4)$/).test(
            blob.type,
          )
        )
          return;
        if (controller.signal.aborted) return;
        const localUrl = URL.createObjectURL(blob);
        urls.push(localUrl);
        setMedia((current) => ({ ...current, [type]: localUrl }));
      } catch {
        /* Keep the original static fallback; music continues independently. */
      }
    };
    void load(branding.poster, 'poster', 4 * 1024 * 1024);
    if (!reduceMotion && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      void load(branding.animation, 'animation', 12 * 1024 * 1024);
    return () => {
      controller.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [branding.poster, branding.animation, reduceMotion]);
  const poster = media.poster ?? DEFAULT_DJ_IMAGE;
  return (
    <div className="dj-character">
      {media.animation && !failed ? (
        <video
          src={media.animation}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          aria-label={`${branding.name} animasyonu`}
          onError={() => setFailed(true)}
        />
      ) : (
        <img
          src={poster}
          alt={branding.name}
          onError={(event) => {
            if (event.currentTarget.getAttribute('src') !== DEFAULT_DJ_IMAGE)
              event.currentTarget.src = DEFAULT_DJ_IMAGE;
          }}
        />
      )}
    </div>
  );
}
