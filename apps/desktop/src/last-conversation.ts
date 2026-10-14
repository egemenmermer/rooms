import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCommunity } from './community';
import { useChannelAccess } from './channel-access';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
type Position = { spaceId: string | null; channelId: string };
export const conversationScope = (server: string, userId: string) =>
  JSON.stringify([server, userId]);
export const useLastConversation = create<{
  positions: Record<string, Position>;
  remember(scope: string, p: Position): void;
}>()(
  persist(
    (set) => ({
      positions: {},
      remember: (scope, p) =>
        set((s) => ({
          positions: Object.fromEntries(
            [...Object.entries(s.positions).filter(([key]) => key !== scope), [scope, p]].slice(
              -20,
            ),
          ),
        })),
    }),
    {
      name: 'rooms-last-conversation-v1',
      version: 1,
      partialize: (s) => ({ positions: s.positions }),
    },
  ),
);
export function useConversationRestore(ready: boolean) {
  const c = useCommunity(),
    navigate = useNavigate(),
    location = useLocation();
  const completed = useRef(''),
    restoring = useRef(false),
    generation = useRef(0);
  const scope = c.user ? conversationScope(c.serverUrl, c.user.id) : '';
  useEffect(() => {
    if (!ready || !scope || c.busy || c.status !== 'connected' || completed.current === scope)
      return;
    completed.current = scope;
    // Explicit deep links, setup and user-selected destinations take precedence.
    if (!['/', '/home'].includes(location.pathname)) return;
    const epoch = ++generation.current;
    restoring.current = true;
    let cancelled = false;
    const interrupt = () => {
      cancelled = true;
    };
    window.addEventListener('pointerdown', interrupt, { once: true });
    window.addEventListener('keydown', interrupt, { once: true });
    const valid = () =>
      !cancelled &&
      epoch === generation.current &&
      conversationScope(
        useCommunity.getState().serverUrl,
        useCommunity.getState().user?.id ?? '',
      ) === scope;
    void (async () => {
      const raw = useLastConversation.getState().positions[scope];
      const saved =
        raw &&
        typeof raw.channelId === 'string' &&
        /^[a-zA-Z0-9_-]{1,128}$/.test(raw.channelId) &&
        (raw.spaceId === null || typeof raw.spaceId === 'string')
          ? raw
          : null;
      if (
        saved?.spaceId &&
        c.spaces.some((s) => s.id === saved.spaceId) &&
        saved.spaceId !== c.activeSpaceId
      )
        await c.openSpace(saved.spaceId);
      if (!valid()) return;
      const state = useCommunity.getState();
      const found =
        saved &&
        (state.channels.some((ch) => ch.id === saved.channelId) ||
          state.dms.some((dm) => dm.id === saved.channelId));
      const target = found
        ? saved.channelId
        : (state.channels.find((ch) => ch.type === 0)?.id ??
          state.channels[0]?.id ??
          state.dms[0]?.id);
      if (target) await state.openChannel(target, true);
      if (!valid()) return;
      const access = target ? useChannelAccess.getState().checks[target] : undefined;
      if (access) {
        const fallback = useCommunity
          .getState()
          .channels.find(
            (ch) => ch.type === 0 && ch.id !== target && !useChannelAccess.getState().checks[ch.id],
          );
        if (fallback) await state.openChannel(fallback.id, true);
      }
      if (
        valid() &&
        useCommunity.getState().activeChannelId &&
        !useChannelAccess.getState().checks[useCommunity.getState().activeChannelId!]
      )
        navigate(
          useCommunity
            .getState()
            .channels.find((ch) => ch.id === useCommunity.getState().activeChannelId)?.type === 2
            ? '/voice'
            : '/chat',
          { replace: true },
        );
    })()
      .catch(() => {})
      .finally(() => {
        if (epoch === generation.current) restoring.current = false;
        window.removeEventListener('pointerdown', interrupt);
        window.removeEventListener('keydown', interrupt);
      });
    return () => {
      cancelled = true;
      generation.current++;
      restoring.current = false;
      window.removeEventListener('pointerdown', interrupt);
      window.removeEventListener('keydown', interrupt);
    };
  }, [ready, scope, c.status, c.busy]);
  useEffect(() => {
    if (
      scope &&
      completed.current === scope &&
      !restoring.current &&
      c.activeChannelId &&
      !useChannelAccess.getState().checks[c.activeChannelId] &&
      ['/chat', '/dm', '/voice'].includes(location.pathname)
    )
      useLastConversation
        .getState()
        .remember(scope, {
          spaceId: c.dms.some((dm) => dm.id === c.activeChannelId) ? null : c.activeSpaceId,
          channelId: c.activeChannelId,
        });
  }, [scope, c.activeChannelId, c.activeSpaceId, location.pathname]);
}
