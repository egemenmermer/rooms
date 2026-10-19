// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SocialInviteLinkSummary, SocialManagedMember } from '@rooms/social';
import { CommunityInvitesTab } from '../apps/desktop/src/CommunityInvitesTab';
afterEach(() => cleanup());

const supported = {
  source: 'rooms-broker',
  state: 'supported',
  managementSupported: true,
} as const;
const link = (
  id: string,
  extra: Partial<SocialInviteLinkSummary> = {},
): SocialInviteLinkSummary => ({
  id,
  createdAt: '2026-10-19T10:00:00.000Z',
  expiresAt: '2026-10-26T10:00:00.000Z',
  maxUses: 10,
  uses: 3,
  pending: 0,
  source: 'app',
  createdBy: 'owner',
  state: 'active',
  ...extra,
});
const members = [
  { user: { id: 'owner', username: 'owner', displayName: 'Ayşe', avatar: null } },
] as unknown as SocialManagedMember[];

it('lists links with uses, expiry and creator, and revokes one after confirmation', async () => {
  let invites = [link('aaaaaaaaaaaaaaaa'), link('bbbbbbbbbbbbbbbb', { uses: 10, state: 'full' })];
  const bridge = {
    listInvites: vi.fn(async () => invites),
    revokeInvite: vi.fn(async (_space: string, id: string) => {
      invites = invites.filter((item) => item.id !== id);
    }),
  };
  render(
    <CommunityInvitesTab
      spaceId="space"
      capability={supported}
      members={members}
      bridge={bridge}
    />,
  );
  const list = await screen.findByRole('list', { name: 'Etkin davet bağlantıları' });
  expect(within(list).getByText('3/10 kişi')).toBeTruthy();
  expect(within(list).getByText('Dolu')).toBeTruthy();
  expect(within(list).getAllByText(/Oluşturan: Ayşe/)).toHaveLength(2);
  expect(screen.getByText(/yalnızca oluşturulurken kopyalanabilir/)).toBeTruthy();
  fireEvent.click(within(list).getAllByRole('button', { name: 'İptal et' })[0]!);
  const dialog = screen.getByRole('dialog', { name: 'Davet bağlantısı iptal edilsin mi?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Bağlantıyı iptal et' }));
  await waitFor(() =>
    expect(bridge.revokeInvite).toHaveBeenCalledWith('space', 'aaaaaaaaaaaaaaaa'),
  );
  await waitFor(() => expect(screen.queryByText('3/10 kişi')).toBeNull());
  expect(bridge.listInvites).toHaveBeenCalledTimes(2);
});

it('explains why non-owners and fixtures cannot manage links, without requesting them', () => {
  const bridge = { listInvites: vi.fn(), revokeInvite: vi.fn() };
  render(
    <CommunityInvitesTab
      spaceId="space"
      capability={{
        source: 'rooms-broker',
        state: 'unsupported',
        managementSupported: false,
        reason: 'Only the community owner can manage invitation links.',
      }}
      members={[]}
      bridge={bridge}
    />,
  );
  expect(screen.getByText(/yalnızca topluluk sahibi/)).toBeTruthy();
  cleanup();
  render(
    <CommunityInvitesTab
      spaceId="space"
      capability={supported}
      members={[]}
      bridge={bridge}
      disabledReason="Yerel görsel örnekte gerçek hesap işlemleri kapalı"
    />,
  );
  expect(screen.getByText(/Yerel görsel örnekte/)).toBeTruthy();
  expect(bridge.listInvites).not.toHaveBeenCalled();
});
