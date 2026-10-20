# @claude in Tayfa text channels

[← README](../README.md) · [Architecture](ARCHITECTURE.md) · [Agent deployment](AGENT_DEPLOYMENT.md)

`@claude` is a conversational bot for Tayfa text channels, modelled on Claude Tag in Slack: people mention it, follow up, and hand it work. Who may use it depends on the [account mode](#account-modes). It is separate from the governed [Tayfa Agent](AGENT_DEPLOYMENT.md), which keeps its per-user grants, approvals and isolated workers.

## How people use it

- **Start:** mention the bot, either by picking it from the mention list or by typing `@claude` as plain text. Every new mention starts a new conversation. Claude also sees the last 15 channel messages as context.
- **Continue:** reply to any of the bot's messages with Tayfa's quote-reply ("Alıntıyla yanıtla"), or with a native Stoat reply from another client. A reply continues that conversation with its full history. Anyone in the channel can continue it, and no mention is needed.
- **Progress:** the bot first answers with a status message that it edits as it works (recent tool steps, elapsed time). When it finishes, the status shows the step count, duration and cost, and the answer arrives as one or more replies.
- **Stop:** reply `stop` (or `dur`/`iptal`) to the conversation to abort the running turn.
- **Downtime:** mentions and replies posted while the bot is offline or reconnecting are answered when it comes back. That covers messages up to `ROOMS_CLAUDE_CATCHUP_HOURS` old (default 12), newer than the last message it saw. Each message is answered once.
- Turns of one conversation run in order. The bot runs one turn at a time overall by default (`ROOMS_CLAUDE_MAX_CONCURRENT`), and later turns are queued with a notice.

## How it works

`apps/services/claude-bot` connects to Stoat with an official bot token and listens for `MESSAGE_CREATE`. For each turn it runs the official Claude Code CLI headless (`claude -p --output-format stream-json`), resuming the conversation's Claude Code session. Each conversation maps to one Claude Code session, and every bot message is recorded so replies can find their conversation. That state lives in `/data/conversations.json`. Claude Code's own session files live in the container's home volume.

Claude works inside the `rooms-claude-bot` container with its own clone of the repository at `/workspace/rooms`. It can run commands, edit code, research the web, and, with `GH_TOKEN`, push branches and open pull requests. With `ROOMS_CLAUDE_PROD_OPS=enabled` it can also `ssh rooms-host` into the production server. Its instructions ask it to confirm changes to production in the conversation before making them. **That confirmation is a model instruction, not an enforced control: anyone who can post where the bot is can ask it to act on production.** Set `ROOMS_CLAUDE_PROD_OPS=disabled` and remove the SSH key to revoke that power.

## Account modes

- **Personal (owner-only):** leave `ANTHROPIC_API_KEY` unset and sign the container in once with the owner's own Claude account: `docker compose run --rm -it --entrypoint claude claude-bot auth login`. Set `ROOMS_CLAUDE_ALLOWED_USERS` to the owner's Tayfa user ID. The bot then ignores mentions and replies from everyone else, and refuses to start without exactly one allowed user. A claude.ai subscription may power only its owner's own use, so this mode must not be opened to other people.
- **Shared:** set `ANTHROPIC_API_KEY`, billed per use to the key's Console organization. Anthropic does not allow claude.ai logins to power bots for other people. `ROOMS_CLAUDE_ALLOWED_USERS` is then optional, and leaving it empty opens the bot to everyone in channels it belongs to. `ROOMS_CLAUDE_MONTHLY_BUDGET_USD` (default 200, `0` disables it) stops new turns once the month's recorded spend reaches it. Also set a spend limit on the key's workspace in the Claude Console, because that is the enforced cap.

`ROOMS_CLAUDE_MODEL` defaults to `claude-sonnet-5-5`.

## Setup

1. **Build:** `pnpm services:build` produces `dist-services/claude-bot.cjs`.
2. **Bot and secrets:** an operator with database access can create the bot user and membership directly; otherwise run `node scripts/claude-bot-provision.mjs <origin> [ssh-host]` on your computer. It signs in with your own Tayfa account (the password is typed there and never stored), creates the official bot, invites it to the servers you choose, and signs out. It then writes `ROOMS_CLAUDE_BOT_TOKEN`, `ANTHROPIC_API_KEY` and optional `GH_TOKEN` to `/etc/rooms-claude/secrets.env` (mode 0600) on the server.
3. **Production access (optional):** create `/etc/rooms-claude/ssh` owned by UID 10002 with mode 0700. In it put `id_ed25519` (0600), a `config` mapping `Host rooms-host` to `HostName host.docker.internal` and `User root`, and `known_hosts`. Add the public key to the host's `/root/.ssh/authorized_keys` with a `from="172.16.0.0/12"` restriction.
4. **Deploy:** copy `infra/claude-bot/Dockerfile`, `infra/claude-bot/compose.yml` and `dist-services/claude-bot.cjs` into `/opt/rooms-claude`, put `ROOMS_CLAUDE_STOAT_URL=<origin>` (plus any overrides) in a `.env` file next to them, then run `docker compose -f compose.yml up -d --build` there. Check with `docker logs rooms-claude-claude-bot-1`.

The container has a 1.5 GB memory cap, 1.5 CPUs, no Linux capabilities, `no-new-privileges`, and no Docker socket or production volumes.

## Limits

- Stoat messages are limited to 2000 characters, so long answers are split on line boundaries with code fences kept balanced.
- Tayfa quote-replies carry only the first 400 characters of the quoted message. The bot matches them to its newest message in that channel that starts the same way.
- A conversation's memory is its Claude Code session. Removing the `home` volume forgets every conversation.
- Live delivery, provider access and production SSH are verified only by the deployment acceptance check, not by unit tests.
