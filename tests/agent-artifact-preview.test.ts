/** Local storage and HTTP fixtures; no production accounts or generated source claims. */
import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { AgentRepository } from '../apps/services/agent/repository';
import { createAgentServer } from '../apps/services/agent/server';
import {
  agentArtifactPreviewSchema,
  AGENT_ARTIFACT_PREVIEW_LIMIT,
} from '../packages/agent-contracts/src/index';
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'rooms-preview-')),
    repository = new AgentRepository(directory, randomBytes(32)),
    taskId = randomUUID(),
    root = join(directory, 'workspaces', taskId);
  mkdirSync(root, { recursive: true });
  repository.data.tasks.push({
    id: taskId,
    roomId: 'room',
    ownerId: 'owner',
    prompt: 'Private task prompt',
    modelConnectionId: randomUUID(),
    state: 'completed',
    progress: [],
    result: 'Done',
    artifacts: [],
    createdAt: new Date().toISOString(),
    runAt: null,
    error: null,
  });
  let revoke = false,
    calls = 0;
  const app = await createAgentServer({
    repository,
    authorize: async (token) => ({
      userId: token,
      roomIds: token === 'outsider' || (revoke && ++calls > 1) ? [] : ['room'],
      canManage: false,
    }),
    reauthorize: async () => ({ userId: 'owner', roomIds: ['room'], canManage: false }),
    executor: async () => ({ result: 'Local fixture', artifacts: [] }),
  });
  await app.server.listen({ host: '127.0.0.1', port: 0 });
  const add = (name: string, text: string | Buffer, mime = 'text/plain') => {
    const a = { id: randomUUID(), name, mime, size: Buffer.byteLength(text) };
    repository.data.tasks[0].artifacts.push(a);
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    return a;
  };
  return {
    directory,
    root,
    repository,
    taskId,
    add,
    revoke: () => {
      revoke = true;
      calls = 0;
    },
    request: (artifactId: string, token = 'member') =>
      fetch(`${app.server.listeningOrigin}/v1/tasks/${taskId}/artifacts/${artifactId}/preview`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    close: async () => {
      await app.server.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
it('previews real UTF8 artifact bytes for an authorized room member with safe metadata and no invented sources', async () => {
  const f = await fixture();
  try {
    const a = f.add(
      'nested/report.md',
      '# Actual local fixture\nTürkçe',
      'application/octet-stream',
    );
    a.size = 1;
    const response = await f.request(a.id);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const p = agentArtifactPreviewSchema.parse(await response.json());
    expect(p).toMatchObject({
      state: 'text',
      text: '# Actual local fixture\nTürkçe',
      encoding: 'utf-8',
      sourcesAvailable: false,
      artifact: { name: 'report.md', size: Buffer.byteLength('# Actual local fixture\nTürkçe') },
    });
    expect(JSON.stringify(p)).not.toContain(f.directory);
    expect(JSON.stringify(p)).not.toContain('Private task prompt');
  } finally {
    await f.close();
  }
});
it('enforces room access before revealing metadata and rechecks authorization before returning bytes', async () => {
  const f = await fixture();
  try {
    const a = f.add('report.txt', 'private fixture');
    expect((await f.request(a.id, 'outsider')).status).toBe(403);
    expect((await f.request(randomUUID())).status).toBe(404);
    f.revoke();
    const response = await f.request(a.id);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('private fixture');
  } finally {
    await f.close();
  }
});
it('caps actual bytes rather than trusting recorded artifact size', async () => {
  const f = await fixture();
  try {
    const a = f.add('large.txt', 'a'.repeat(AGENT_ARTIFACT_PREVIEW_LIMIT + 1));
    a.size = 1;
    expect(await (await f.request(a.id)).json()).toMatchObject({
      state: 'too-large',
      reason: 'preview-size-limit',
      artifact: { size: AGENT_ARTIFACT_PREVIEW_LIMIT + 1 },
    });
    const edge = f.add('edge.txt', 'a'.repeat(AGENT_ARTIFACT_PREVIEW_LIMIT));
    expect(((await (await f.request(edge.id)).json()) as any).state).toBe('text');
  } finally {
    await f.close();
  }
});
it('rejects active extension/MIME, disguised active markup, binary controls and invalid UTF8', async () => {
  const f = await fixture();
  try {
    for (const [name, data, mime, reason] of [
      ['page.html', 'hello', 'text/plain', 'unsupported-type'],
      ['draw.svg', 'hello', 'image/svg+xml', 'unsupported-type'],
      ['app.js', 'alert(1)', 'text/plain', 'unsupported-type'],
      ['script.txt', 'plain', 'text/javascript', 'unsupported-type'],
      ['disguised.md', '<script>alert(1)</script>', 'text/markdown', 'active-content'],
      ['nul.txt', 'a\0b', 'text/plain', 'invalid-text'],
      ['invalid.txt', Buffer.from([255, 254]), 'text/plain', 'invalid-text'],
    ] as const) {
      const a = f.add(name, data, mime);
      const p = (await (await f.request(a.id)).json()) as any;
      expect(p).toMatchObject({ state: 'unsupported', reason });
      expect(p.text).toBeUndefined();
    }
  } finally {
    await f.close();
  }
});
it('uses existing download traversal and symlink defenses without path/error disclosure', async () => {
  const f = await fixture();
  try {
    const secret = join(f.directory, 'secret.txt');
    writeFileSync(secret, 'MUST_NOT_LEAK');
    const bads = ['../secret.txt', secret, 'linked.txt'];
    symlinkSync(secret, join(f.root, 'linked.txt'));
    for (const name of bads) {
      const a = { id: randomUUID(), name, mime: 'text/plain', size: 10 };
      f.repository.data.tasks[0].artifacts.push(a);
      const p = await (await f.request(a.id)).json();
      expect(p).toMatchObject({
        state: 'unavailable',
        artifact: null,
        reason: 'artifact-unavailable',
      });
      expect(JSON.stringify(p)).not.toMatch(/MUST_NOT_LEAK|secret.txt|rooms-preview-/);
    }
  } finally {
    await f.close();
  }
});
