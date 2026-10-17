// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SOCIAL_ROLE_PERMISSION_KEYS, type SocialCommunityManagement } from '@rooms/social';
import CommunityManagementSurface from '../apps/desktop/src/CommunityManagementSurface';
import { inheritedRolePermissions } from '../apps/desktop/src/CommunityRoles';
import { useCommunity } from '../apps/desktop/src/community';
import { queryClient } from '../apps/desktop/src/query-client';
function snapshot(): SocialCommunityManagement {
  return {
    spaceId: 'space',
    access: 'allowed',
    capabilities: {
      manageServer: true,
      manageChannels: true,
      manageRoles: true,
      managePermissions: true,
      assignRoles: true,
      kickMembers: true,
    },
    roles: [],
    grantablePermissions: [...SOCIAL_ROLE_PERMISSION_KEYS],
    members: [],
    invites: {
      source: 'rooms-broker',
      state: 'unsupported',
      managementSupported: false,
      reason: 'fixture',
    },
    concurrency: 'last-write-wins',
  };
}
beforeEach(() => {
  history.replaceState(null, '', '/');
  useCommunity.setState({
    user: { id: 'owner', username: 'Owner', displayName: 'Owner', avatar: null },
    activeSpaceId: 'space',
    serverUrl: 'https://example.test',
    status: 'connected',
    spaces: [{ id: 'space', name: 'Fixture space', icon: null, ownerId: 'owner' }],
  });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
});
it('keeps the newly created editor across its own permission invalidation and delayed gateway echo', async () => {
  let current = snapshot();
  const bridge = {
    communityManagement: vi.fn(async () => current),
    setMemberRoles: vi.fn(),
    removeCommunityMember: vi.fn(),
    changeCommunityRole: vi.fn(async () => {
      current = {
        ...current,
        roles: [
          {
            id: 'created',
            name: 'Kanka',
            rank: 1,
            assignable: true,
            editable: true,
            permissionsEditable: true,
            color: null,
            permissions: inheritedRolePermissions(),
          },
        ],
      };
      window.dispatchEvent(new Event('rooms:channel-access-invalidated'));
      return { roleId: 'created', management: current };
    }),
  };
  render(<CommunityManagementSurface bridge={bridge} />);
  fireEvent.click(await screen.findByRole('tab', { name: /Roller ·/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Rol oluştur' }));
  fireEvent.change(screen.getByLabelText('Rol adı'), { target: { value: 'Kanka' } });
  fireEvent.click(screen.getByRole('button', { name: 'Rolü oluştur' }));
  await screen.findByRole('heading', { name: 'Kanka' });
  fireEvent.change(screen.getByLabelText('Rol adı'), { target: { value: 'Unsaved name' } });
  act(() => window.dispatchEvent(new Event('rooms:channel-access-invalidated')));
  await waitFor(() => expect(bridge.communityManagement).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect((screen.getByLabelText('Rol adı') as HTMLInputElement).disabled).toBe(false),
  );
  expect((screen.getByLabelText('Rol adı') as HTMLInputElement).value).toBe('Unsaved name');
  expect(bridge.changeCommunityRole).toHaveBeenCalledTimes(1);
});
it('removes roles/editor when management permission is revoked', async () => {
  let current = snapshot();
  current.roles = [
    {
      id: 'role',
      name: 'Kanka',
      rank: 1,
      assignable: true,
      editable: true,
      permissionsEditable: true,
      color: null,
      permissions: inheritedRolePermissions(),
    },
  ];
  const bridge = {
    communityManagement: vi.fn(async () => current),
    setMemberRoles: vi.fn(),
    removeCommunityMember: vi.fn(),
    changeCommunityRole: vi.fn(),
  };
  render(<CommunityManagementSurface bridge={bridge} />);
  fireEvent.click(await screen.findByRole('tab', { name: /Roller ·/ }));
  fireEvent.click(screen.getByRole('button', { name: /Kanka 0 üye/ }));
  current = { ...snapshot(), access: 'denied' };
  act(() => window.dispatchEvent(new Event('rooms:channel-access-invalidated')));
  await screen.findByRole('heading', { name: 'Yönetim yetkin yok' });
  expect(screen.queryByLabelText('Rol adı')).toBeNull();
  expect(bridge.changeCommunityRole).not.toHaveBeenCalled();
});
it('bans a member below you after confirming, from the member menu', async () => {
  const member = {
    user: { id: 'ece', username: 'ece', displayName: 'Ece', avatar: null },
    status: 'online' as const,
    statusText: null,
    roles: [],
    canAssignRoles: false,
    canRemove: true,
    canBan: true,
  };
  const current = {
    ...snapshot(),
    capabilities: { ...snapshot().capabilities, banMembers: true },
    members: [member],
  };
  const bridge = {
    communityManagement: vi.fn(async () => current),
    setMemberRoles: vi.fn(),
    removeCommunityMember: vi.fn(),
    changeCommunityRole: vi.fn(),
    banCommunityMember: vi.fn(async () => ({ ...current, members: [] })),
  };
  render(<CommunityManagementSurface bridge={bridge} />);
  fireEvent.click(await screen.findByRole('button', { name: /Yönet/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Yasakla' }));
  expect(bridge.banCommunityMember).not.toHaveBeenCalled();
  expect(screen.getByText(/davetle de geri dönemez/)).toBeTruthy();
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /Yasakla/ }));
  await waitFor(() =>
    expect(bridge.banCommunityMember).toHaveBeenCalledWith({ spaceId: 'space', userId: 'ece' }),
  );
});
