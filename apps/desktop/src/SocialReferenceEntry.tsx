import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SocialDetailFixture } from './dev/social-detail-fixture';
import { useCommunity } from './community';
import { ChannelEditor, CommunityEditor, NotificationSurface, type CommunityNotification } from './CommunitySettings';
import { preserveReferenceFixtureRoute } from './dev/fixture-navigation';

function fixtureParams() {
  const params = new URLSearchParams(location.search);
  const id = params.get('fixture') || '';
  const variant = params.get('variant') || 'default';
  return { id, variant, development: import.meta.env.DEV };
}

function useSocialDetailFixture(ids: readonly string[]) {
  const { id, variant, development } = fixtureParams();
  const [fixture, setFixture] = useState<SocialDetailFixture>();
  const [error, setError] = useState('');
  const enabled = development && ids.includes(id);
  useEffect(() => {
    let current = true;
    setFixture(undefined); setError('');
    if (enabled) void import('./dev/social-detail-fixture').then(module => {
      const value = module.getSocialDetailFixture(id, variant);
      if (current) setFixture(value);
    }).catch(failure => { if (current) setError(failure instanceof Error ? failure.message : 'Yerel ekran açılamadı.'); });
    return () => { current = false; };
  }, [enabled, id, variant]);
  return { enabled, fixture, error };
}

/** DEV-only local projection for S17/S18; editor operations are explicitly disabled. */
export function SocialReferenceOverlay({ onClose }: { onClose(): void }) {
  const { enabled, fixture, error } = useSocialDetailFixture(['S17', 'S18']);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(false), [enabled, fixture?.metadata.id, fixture?.metadata.variant]);
  if (!enabled || dismissed) return null;
  const dismiss = () => { setDismissed(true); onClose(); };
  if (!fixture) return <div className="social-detail-fixture-state" role={error ? 'alert' : 'status'}>{error || 'Yerel görünüm hazırlanıyor…'}</div>;
  if (fixture.ui.surface === 'community-editor') return <CommunityEditor fixture mode={fixture.ui.mode} space={fixture.ui.mode === 'edit' ? fixture.ui.draft : undefined} description={fixture.ui.description} referenceDraftName={fixture.ui.draft.name} referenceCreated={fixture.ui.createdReferenceRequested ? { name: fixture.ui.draft.name } : undefined} canEdit={false} onClose={dismiss}/>;
  if (fixture.ui.surface === 'channel-editor') {
    const space = fixture.publicState.spaces[0];
    if (!space) return <div className="social-detail-fixture-state" role="alert">Yerel topluluk örneği yok.</div>;
    const privateReference = fixture.ui.privateReferenceRequested ? {
      name: fixture.ui.draft.name,
      description: fixture.ui.draft.topic ?? '',
      category: fixture.ui.initialType === 'voice' ? 'SES ODALARI' : 'SOHBET',
      choices: [
        ...(fixture.publicState.user ? [{ id: fixture.publicState.user.id, name: fixture.publicState.user.displayName || fixture.publicState.user.username, kind: 'member' as const }] : []),
        ...fixture.friends.map(friend => ({ id: friend.user.id, name: friend.user.displayName || friend.user.username, kind: 'member' as const })),
      ],
      selectedIds: [fixture.publicState.user?.id, fixture.friends.find(friend => friend.user.displayName === 'Ece')?.user.id].filter((id): id is string => !!id),
    } : undefined;
    return <ChannelEditor fixture mode={fixture.ui.mode} space={space} channel={fixture.ui.mode === 'delete' ? fixture.ui.draft : undefined} initialType={fixture.ui.initialType} referenceDraftName={fixture.ui.draft.name} referenceDraftDescription={fixture.ui.draft.topic ?? ''} referenceDraftCategory={fixture.ui.initialType === 'voice' ? 'SES ODALARI' : 'SOHBET'} referencePrivate={privateReference} canManage={false} onClose={dismiss}/>;
  }
  return null;
}

/** Production deliberately shows the server capability boundary, not synthetic notifications. */
export function SocialNotificationsPage() {
  const navigate = useNavigate();
  const { enabled, fixture, error } = useSocialDetailFixture(['S16']);
  if (enabled && !fixture) return <div className="social-detail-fixture-state" role={error ? 'alert' : 'status'}>{error || 'Yerel görünüm hazırlanıyor…'}</div>;
  const items: CommunityNotification[] = enabled && fixture?.ui.surface === 'notifications' ? fixture.ui.items.map(item => {
    const target = fixture.ui.surface === 'notifications' ? fixture.ui.targets[item.id] : undefined;
    return { ...item, onOpen: target ? () => {
      if (!target.channelId) { navigate(preserveReferenceFixtureRoute(target.route)); return; }
      const state = useCommunity.getState();
      const channel = [...state.channels, ...state.dms].find(candidate => candidate.id === target.channelId);
      const message = target.messageId ? state.messages.find(candidate => candidate.id === target.messageId && candidate.channelId === target.channelId) : undefined;
      if (!channel || target.messageId && !message) return;
      useCommunity.setState({ activeSpaceId: channel.spaceId ?? null, activeChannelId: channel.id, messages: state.messages.filter(candidate => candidate.channelId === channel.id), loadingMessages: false, hasOlder: false, error: null });
      navigate(preserveReferenceFixtureRoute(`${target.route}${target.messageId ? `?message=${encodeURIComponent(target.messageId)}` : ''}`));
    } : undefined };
  }) : [];
  return <section className="social-notifications-page"><NotificationSurface items={items} fixture={enabled} unavailableReason={enabled ? undefined : 'Bu sunucuda toplu bildirim akışı sağlanmıyor.'}/></section>;
}
