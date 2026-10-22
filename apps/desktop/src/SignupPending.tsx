import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, LoaderCircle, LogOut, RefreshCw, Send, UserX } from 'lucide-react';
import type { SocialSignupState } from '@rooms/social';
import { useCommunity } from './community';
import { uiError } from './i18n';

/** How often the waiting screen asks whether an admin decided. */
export const SIGNUP_POLL_MS = 30000;
const WAITING = new Set(['pending', 'approved', 'rejected', 'expired']);

export interface SignupGate {
  /** The account belongs to no community and has an approved sign-up request to show. */
  blocking: boolean;
  state: SocialSignupState | null;
  checking: boolean;
  error: string;
  check(): Promise<void>;
  reapply(): Promise<void>;
  dismiss(): void;
}

/**
 * Approved sign-up: a new account belongs to no community until an admin approves it. While it
 * waits (or was rejected) the app shows the waiting screen instead of an empty community view.
 * Members never see it: the screen appears only when the account has no community at all.
 */
export function useSignupGate(): SignupGate {
  const userId = useCommunity((state) => state.user?.id ?? null);
  const serverUrl = useCommunity((state) => state.serverUrl);
  const spaceCount = useCommunity((state) => state.spaces.length);
  const [state, setState] = useState<SocialSignupState | null>(null);
  const [noSpaces, setNoSpaces] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const scope = `${serverUrl} ${userId ?? ''}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  useEffect(() => {
    setState(null);
    setNoSpaces(false);
    setError('');
    setDismissed(false);
  }, [scope]);
  const check = useCallback(async () => {
    const social = window.rooms?.social;
    if (!userId || !social?.signupStatus) return;
    const asked = scope;
    setChecking(true);
    try {
      const value = await useCommunity.getState().signupStatus();
      if (scopeRef.current !== asked) return;
      setError('');
      setState(value);
      // Confirm with the server: the store's list may still be loading after sign-in.
      if (value.status !== 'joined' && (WAITING.has(value.status) || value.enabled)) {
        const spaces = await social.spaces();
        if (scopeRef.current === asked) setNoSpaces(spaces.length === 0);
      } else setNoSpaces(false);
    } catch (failure) {
      if (scopeRef.current === asked) setError(uiError(failure));
    } finally {
      if (scopeRef.current === asked) setChecking(false);
    }
  }, [scope, userId]);
  // Only an account without any community can be waiting for approval.
  useEffect(() => {
    if (userId && spaceCount === 0) void check();
    else setNoSpaces(false);
  }, [check, userId, spaceCount]);
  const status = state?.status;
  const blocking =
    !!userId &&
    spaceCount === 0 &&
    noSpaces &&
    !!status &&
    (WAITING.has(status) || (status === 'none' && !!state?.enabled && !dismissed));
  useEffect(() => {
    if (!blocking || (status !== 'pending' && status !== 'approved')) return;
    const timer = setInterval(() => void check(), SIGNUP_POLL_MS);
    return () => clearInterval(timer);
  }, [blocking, status, check]);
  const reapply = useCallback(async () => {
    setError('');
    try {
      await useCommunity.getState().reapplySignup();
      await check();
    } catch (failure) {
      setError(uiError(failure));
    }
  }, [check]);
  return {
    blocking,
    state,
    checking,
    error,
    check,
    reapply,
    dismiss: () => setDismissed(true),
  };
}

const formatTime = (iso: string | null) => {
  const time = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(time) ? new Date(time).toLocaleString('tr-TR') : null;
};

/** Waiting, rejected and expired states of an approved sign-up request. */
export function SignupPendingScreen({
  gate,
  onSignedOut,
}: {
  gate: SignupGate;
  onSignedOut?(): void;
}) {
  const c = useCommunity();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const status = gate.state?.status ?? 'pending';
  const name = c.user?.displayName || c.user?.username || '';
  const requested = formatTime(gate.state?.createdAt ?? null);
  const run = async (work: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    setError('');
    try {
      await work();
    } catch (failure) {
      setError(uiError(failure));
    } finally {
      setWorking(false);
    }
  };
  const signOut = () =>
    run(async () => {
      await c.logout();
      onSignedOut?.();
    });
  const shown = error || gate.error;
  return (
    <section className="ref-auth-form ref-signup-pending" aria-busy={working || gate.checking}>
      {status === 'rejected' ? (
        <>
          <UserX size={34} aria-hidden="true" />
          <h2>Kayıt isteğin reddedildi</h2>
          <p>
            Topluluk yöneticisi bu hesabın katılma isteğini onaylamadı. Bu hesapla topluluğa
            giremezsin. Bir yanlışlık olduğunu düşünüyorsan topluluktan birinden davet bağlantısı
            iste.
          </p>
        </>
      ) : status === 'expired' || status === 'none' ? (
        <>
          <Clock size={34} aria-hidden="true" />
          <h2>{status === 'expired' ? 'İsteğinin süresi doldu' : 'Henüz bir topluluğun yok'}</h2>
          <p>
            {status === 'expired'
              ? '14 gün içinde kimse karar vermediği için isteğin kapandı. İstersen yeniden gönderebilirsin.'
              : 'Bu hesap hiçbir topluluğa üye değil. Topluluk yöneticisinden katılmak için onay isteyebilirsin.'}
          </p>
          {gate.state?.enabled ? (
            <button
              className="button primary full"
              disabled={working}
              onClick={() => void run(gate.reapply)}
            >
              <Send size={16} />
              {status === 'expired' ? 'Yeniden istek gönder' : 'Katılma isteği gönder'}
            </button>
          ) : (
            <p className="ref-auth-help">Bu sunucu şu an yeni kayıt isteği almıyor.</p>
          )}
          {status === 'none' && (
            <button className="button secondary full" disabled={working} onClick={gate.dismiss}>
              Şimdilik geç
            </button>
          )}
        </>
      ) : (
        <>
          <span className="ref-signup-pending-icon" aria-hidden="true">
            {status === 'approved' ? (
              <LoaderCircle size={30} className="spin" />
            ) : (
              <Clock size={30} />
            )}
          </span>
          <h2>{status === 'approved' ? 'Onaylandın, katılıyorsun…' : 'Onay bekliyor'}</h2>
          <p role="status">
            {status === 'approved'
              ? 'Topluluk yöneticisi isteğini onayladı. Kanallar birazdan açılacak.'
              : `Hesabın oluşturuldu${name ? `, ${name}` : ''}. Topluluk yöneticisi isteğini onaylayınca kanallar burada açılacak. Bu ekran kendiliğinden yenilenir; istersen çıkış yapıp sonra yeniden giriş yapabilirsin.`}
          </p>
          {requested && <p className="ref-auth-help">İstek zamanı: {requested}</p>}
          <button
            className="button primary full"
            disabled={working || gate.checking}
            onClick={() => void run(gate.check)}
          >
            <RefreshCw size={16} />
            {gate.checking ? 'Kontrol ediliyor…' : 'Durumu yenile'}
          </button>
        </>
      )}
      <button className="button secondary full" disabled={working} onClick={() => void signOut()}>
        <LogOut size={16} />
        Çıkış yap
      </button>
      {shown && (
        <div className="ref-auth-notice error" role="alert">
          {shown}
        </div>
      )}
    </section>
  );
}
