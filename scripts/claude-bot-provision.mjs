#!/usr/bin/env node
// Interactive, owner-run setup for the ROOMS @claude bot.
// Signs in with YOUR ROOMS account (typed here, never stored), creates the official Stoat bot,
// invites it to the servers you choose, signs out, and writes the bot token plus your
// Anthropic API key (and optional GitHub token) to /etc/rooms-claude/secrets.env over SSH.
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';

// Usage: node scripts/claude-bot-provision.mjs <origin> [ssh-host]
//        node scripts/claude-bot-provision.mjs --invite <botId> <origin>   (server owner adds the bot)
const argv = process.argv.slice(2);
const inviteAt = argv.indexOf('--invite');
const inviteOnly = inviteAt >= 0 ? argv.splice(inviteAt, 2)[1] : null;
if (!argv[0]?.startsWith('https://')) {
  console.error('Usage: node scripts/claude-bot-provision.mjs <https-origin> [ssh-host]');
  process.exit(1);
}
const origin = argv[0].replace(/\/+$/, '');
const sshHost = argv[1] ?? 'rooms';
const api = `${origin}/api`;

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
// Hidden prompts: the question is printed first, then keystrokes are not echoed.
rl._writeToOutput = (text) => {
  if (!muted) rl.output.write(text);
};
const ask = (question, hidden = false) =>
  new Promise((resolve) => {
    rl.question(question, (answer) => {
      if (muted) rl.output.write('\n');
      muted = false;
      resolve(answer.trim());
    });
    muted = hidden;
  });
async function call(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-session-token': token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'error',
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(`${method} ${path} failed (${response.status}): ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}
function readyServers(token) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `${origin.replace(/^http/, 'ws')}/ws?version=1&format=json&token=${encodeURIComponent(token)}`,
    );
    const timer = setTimeout(
      () => (socket.close(), reject(new Error('Timed out waiting for Ready'))),
      15000,
    );
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'Ready') {
        clearTimeout(timer);
        socket.close();
        resolve({
          servers: data.servers ?? [],
          me: (data.users ?? []).find((u) => u.relationship === 'User'),
        });
      }
    };
    socket.onerror = () => reject(new Error('WebSocket error'));
  });
}

console.log(
  `ROOMS @claude bot setup for ${origin}\nYour ROOMS password is used once to sign in and is not stored.\n`,
);
const email = await ask('ROOMS email: ');
const password = await ask('ROOMS password: ', true);
let session = await call('/auth/session/login', {
  method: 'POST',
  body: { email, password, friendly_name: 'claude-bot setup' },
});
if (session.result === 'MFA') {
  const code = await ask('Two-factor code: ', true);
  session = await call('/auth/session/login', {
    method: 'POST',
    body: {
      mfa_ticket: session.ticket,
      mfa_response: { totp_code: code },
      friendly_name: 'claude-bot setup',
    },
  });
}
const token = session.token;
if (!token) throw new Error('Sign-in did not return a session.');
try {
  if (inviteOnly) {
    // Run by someone who can manage the target server (e.g. its owner) to add an existing public bot.
    const botId = inviteOnly;
    const { servers } = await readyServers(token);
    for (const server of servers) {
      const answer = (await ask(`Add bot ${botId} to "${server.name}"? [y/N]: `)).toLowerCase();
      if (answer !== 'y') continue;
      await call(`/bots/${botId}/invite`, { method: 'POST', token, body: { server: server._id } })
        .then(() => console.log(`  added to ${server.name}`))
        .catch((error) => console.log(`  could not add: ${error.message}`));
    }
  } else {
    const name = (await ask('Bot name [claude]: ')) || 'claude';
    const owned = await call('/bots/@me', { token });
    const ownedUsers = new Map((owned.users ?? []).map((u) => [u._id, u]));
    let bot = (owned.bots ?? []).find((b) => ownedUsers.get(b._id)?.username === name);
    if (bot) console.log(`Reusing your existing bot @${name} (${bot._id}).`);
    else {
      const created = await call('/bots/create', { method: 'POST', token, body: { name } });
      bot = created.bot ?? created;
      console.log(`Created bot @${name} (${bot._id}).`);
    }
    if (!bot.token) bot = (await call(`/bots/${bot._id}`, { token })).bot ?? bot;
    if (!bot._id || !bot.token) throw new Error('Could not read the bot token.');
    const { servers, me } = await readyServers(token);
    const blocked = [];
    for (const server of servers) {
      const mine = me && server.owner === me._id;
      const answer = (
        await ask(
          `Add @${name} to "${server.name}"${mine ? ' (you own it)' : ''}? [${mine ? 'Y/n' : 'y/N'}]: `,
        )
      ).toLowerCase();
      if (!(answer === 'y' || (mine && answer === ''))) continue;
      try {
        await call(`/bots/${bot._id}/invite`, {
          method: 'POST',
          token,
          body: { server: server._id },
        });
        console.log(`  added to ${server.name}`);
      } catch (error) {
        if (!String(error.message).includes('MissingPermission')) throw error;
        const owner = await call(`/users/${server.owner}`, { token }).catch(() => ({}));
        blocked.push(`${server.name} (owner: @${owner.username ?? server.owner})`);
        console.log(`  you lack "Manage Server" on ${server.name}; its owner must add the bot.`);
      }
    }
    if (blocked.length) {
      await call(`/bots/${bot._id}`, { method: 'PATCH', token, body: { public: true } });
      console.log(
        `\nMade @${name} invitable. For ${blocked.join(', ')}, the owner runs:\n  node scripts/claude-bot-provision.mjs --invite ${bot._id}\n`,
      );
    }
    const anthropic = await ask('Anthropic API key (sk-ant-…): ', true);
    if (!anthropic.startsWith('sk-ant-'))
      throw new Error('That does not look like an Anthropic API key.');
    const github = await ask('GitHub token for pull requests (optional, Enter to skip): ', true);
    const env =
      [
        `ROOMS_CLAUDE_BOT_TOKEN=${bot.token}`,
        `ANTHROPIC_API_KEY=${anthropic}`,
        ...(github ? [`GH_TOKEN=${github}`] : []),
      ].join('\n') + '\n';
    const write = spawnSync(
      'ssh',
      [
        sshHost,
        'umask 077 && mkdir -p /etc/rooms-claude && cat > /etc/rooms-claude/secrets.env && chmod 600 /etc/rooms-claude/secrets.env',
      ],
      { input: env, stdio: ['pipe', 'inherit', 'inherit'] },
    );
    if (write.status !== 0) throw new Error('Writing secrets on the server failed.');
    console.log(`Saved secrets to ${sshHost}:/etc/rooms-claude/secrets.env (mode 600).`);
  }
} finally {
  await call('/auth/session/logout', { method: 'POST', token }).catch(() => {});
  rl.close();
}
