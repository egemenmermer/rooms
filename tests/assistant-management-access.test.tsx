// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DesktopBridge } from '@rooms/contracts';

vi.mock('../apps/desktop/src/realtime', () => ({
  useRealtime: () => ({ channelId: null, participants: [], status: 'idle' }),
}));
import { AssistantManagement } from '../apps/desktop/src/AssistantManagement';
import { useCommunity } from '../apps/desktop/src/community';

afterEach(() => {
  cleanup();
  delete window.rooms;
});

it('shows a member the "yetkin yok" view and their own history instead of an error', async () => {
  const audit = vi.fn(async (roomId?: string) => {
    if (roomId) throw new Error('MANAGE_REQUIRED');
    return { scope: 'own', roomId: null, entries: [], total: 0 };
  });
  window.rooms = {
    agent: {
      status: async () => ({ configured: true, connected: true, userId: 'member' }),
      authority: async () => ({
        userId: 'member',
        roomId: 'room',
        canManage: false,
        yolo: false,
        principals: [],
        scopes: [],
      }),
      audit,
    },
    social: { members: async () => [] },
  } as unknown as DesktopBridge;
  useCommunity.setState({
    user: { id: 'member', username: 'member', displayName: 'Member', avatar: null },
    activeChannelId: 'room',
    activeSpaceId: null,
  });
  render(
    <MemoryRouter>
      <AssistantManagement />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('heading', { name: 'Bu ayarı yönetme yetkin yok' })).toBeTruthy();
  expect(audit).toHaveBeenCalledWith();
  expect(audit).not.toHaveBeenCalledWith('room');
});

it('has a Turkish label for every action the Agent audit can show', async () => {
  const { auditActions } = await import('../apps/services/agent/authority');
  const { auditActionLabels } = await import('../apps/desktop/src/AssistantManagement');
  expect([...auditActions].filter((action) => !auditActionLabels[action])).toEqual([]);
});
