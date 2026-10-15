// @vitest-environment jsdom
/** Local UI/bridge fixtures, not a deployed authorization test. */
import React, { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommunityRoles, inheritedRolePermissions } from '../apps/desktop/src/CommunityRoles';
import {
  SOCIAL_ROLE_PERMISSION_KEYS,
  type SocialCommunityManagement,
  type SocialCommunityRoleChange,
} from '@rooms/social';
afterEach(cleanup);
function state(): SocialCommunityManagement {
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
    roles: [
      {
        id: 'kanka',
        name: 'Kanka',
        rank: 1,
        assignable: true,
        editable: true,
        permissionsEditable: true,
        color: '#9b8afb',
        permissions: inheritedRolePermissions(),
      },
    ],
    grantablePermissions: [...SOCIAL_ROLE_PERMISSION_KEYS],
    members: [],
    invites: {
      source: 'rooms-broker',
      state: 'unsupported',
      managementSupported: false,
      reason: 'Local fixture',
    },
    concurrency: 'last-write-wins',
  };
}
function fixture(initial = state(), fail = false) {
  const calls = vi.fn();
  function Harness() {
    const [snapshot, setSnapshot] = useState(initial);
    const [busy, setBusy] = useState(false);
    async function mutate(change: SocialCommunityRoleChange) {
      setBusy(true);
      calls(change);
      try {
        if (fail) throw new Error('Sunucuya ulaşılamadı.');
        const next = structuredClone(snapshot);
        let roleId = 'roleId' in change ? change.roleId : 'new-role';
        if (change.action === 'create')
          next.roles.push({ ...next.roles[0], id: roleId, name: change.name });
        if (change.action === 'appearance')
          Object.assign(
            next.roles.find((role) => role.id === roleId)!,
            { name: change.name, color: change.color },
          );
        if (change.action === 'permissions')
          next.roles.find((role) => role.id === roleId)!.permissions = change.values;
        if (change.action === 'delete')
          next.roles = next.roles.filter((role) => role.id !== roleId);
        setSnapshot(next);
        return { roleId, management: next };
      } finally {
        setBusy(false);
      }
    }
    return <CommunityRoles {...{ snapshot, busy, mutate }} />;
  }
  render(<Harness />);
  return calls;
}
it('creates a named role and saves appearance and chosen permissions through distinct operations', async () => {
  const calls = fixture();
  fireEvent.click(screen.getByRole('button', { name: 'Rol oluştur' }));
  fireEvent.change(screen.getByLabelText('Rol adı'), { target: { value: 'Gece tayfası' } });
  fireEvent.click(screen.getByRole('button', { name: 'Rolü oluştur' }));
  await screen.findByRole('heading', { name: 'Gece tayfası' });
  expect(calls).toHaveBeenCalledWith({ action: 'create', spaceId: 'space', name: 'Gece tayfası' });
  fireEvent.click(screen.getByRole('button', { name: '#57ba9c renk' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await screen.findByText('Kaydedildi');
  expect(calls).toHaveBeenLastCalledWith({
    action: 'appearance',
    spaceId: 'space',
    roleId: 'new-role',
    name: 'Gece tayfası',
    color: '#57ba9c',
  });
  fireEvent.click(screen.getByRole('tab', { name: 'Yetkiler' }));
  fireEvent.change(screen.getByLabelText('Kamera ve ekran paylaş'), { target: { value: 'allow' } });
  fireEvent.change(screen.getByLabelText('Üyelere rol ver'), { target: { value: 'deny' } });
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await screen.findByText('Kaydedildi');
  expect(calls).toHaveBeenLastCalledWith({
    action: 'permissions',
    spaceId: 'space',
    roleId: 'new-role',
    values: { ...inheritedRolePermissions(), video: 'allow', assignRoles: 'deny' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Rollere dön' }));
  fireEvent.click(screen.getByRole('button', { name: /Gece tayfası 0 üye/ }));
  fireEvent.click(screen.getByRole('tab', { name: 'Yetkiler' }));
  expect((screen.getByLabelText('Kamera ve ekran paylaş') as HTMLSelectElement).value).toBe(
    'allow',
  );
});
it('does not save a failed change and keeps the edited name for retry', async () => {
  const calls = fixture(state(), true);
  fireEvent.click(screen.getByRole('button', { name: /Kanka 0 üye/ }));
  fireEvent.change(screen.getByLabelText('Rol adı'), { target: { value: 'Gece tayfası' } });
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Sunucuya ulaşılamadı.');
  expect(screen.queryByText('Kaydedildi')).toBeNull();
  expect((screen.getByLabelText('Rol adı') as HTMLInputElement).value).toBe('Gece tayfası');
  expect(calls).toHaveBeenCalledTimes(1);
});
it('keeps unknown/ungrantable values when applying a template and does not auto-save', () => {
  const initial = state();
  initial.grantablePermissions = ['video'];
  initial.roles[0].permissions.assignRoles = 'deny';
  const calls = fixture(initial);
  fireEvent.click(screen.getByRole('button', { name: /Kanka 0 üye/ }));
  fireEvent.click(screen.getByRole('tab', { name: 'Yetkiler' }));
  fireEvent.click(screen.getByRole('button', { name: /Yayıncı Kamera/ }));
  expect((screen.getByLabelText('Üyelere rol ver') as HTMLSelectElement).disabled).toBe(true);
  expect((screen.getByLabelText('Üyelere rol ver') as HTMLSelectElement).value).toBe('deny');
  expect((screen.getByLabelText('Kamera ve ekran paylaş') as HTMLSelectElement).value).toBe(
    'allow',
  );
  expect(calls).not.toHaveBeenCalled();
});
it('requires an explicit delete confirmation and removes the row only after success', async () => {
  const calls = fixture();
  fireEvent.click(screen.getByRole('button', { name: 'Kanka rolünü sil' }));
  expect(calls).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Rolü sil' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Kanka rolünü sil' })).toBeNull(),
  );
  expect(calls).toHaveBeenCalledWith({ action: 'delete', spaceId: 'space', roleId: 'kanka' });
});
it('protects unsaved changes when returning to roles', async () => {
  fixture();
  fireEvent.click(screen.getByRole('button', { name: /Kanka 0 üye/ }));
  fireEvent.change(screen.getByLabelText('Rol adı'), { target: { value: 'Başka isim' } });
  fireEvent.click(screen.getByRole('button', { name: 'Rollere dön' }));
  expect(screen.getByRole('heading', { name: 'Değişikliklerden vazgeçilsin mi?' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Düzenlemeye devam et' }));
  expect((screen.getByLabelText('Rol adı') as HTMLInputElement).value).toBe('Başka isim');
});
