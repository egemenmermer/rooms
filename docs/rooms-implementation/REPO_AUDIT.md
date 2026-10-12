# Repository baseline

2026-10-10: main branch initially clean, latest delivered version 0.1.14. Existing app uses Electron 44, React 19, TypeScript strict, Vite 7, pnpm 11; React Router HashRouter, Zustand, TanStack Query. Preserve lockfile and architecture.

Commands: `pnpm dev` (Electron), `pnpm dev:web` (renderer), `pnpm typecheck`, `pnpm test`, `pnpm test:desktop`, `pnpm build`. Baseline checks have not yet been executed for this reference task. No pre-existing failure is inferred from earlier evidence.

App.tsx owns persistent shell/routes and settings overlay; community.ts owns native-backed Stoat state; realtime.ts owns navigation-independent LiveKit state. Existing routes: home, spaces, chat, voice, cinema, youtube, games, together, agent, settings. RealSocial, VoiceSidebar, People, ChannelTools implement social actions. Settings/providers/native IPC own personal connections. Games/activities implement authoritative server actions.

External dependencies remain separate: absent dedicated Agent host, personal model/provider accounts, signing identity and Windows hardware. Local visual fixtures cannot certify any external dependency.

Shared files owned by root: App.tsx, main.tsx, shared styles, stores, package/native configuration. Agent assignments are recorded in CHECKPOINT.md; read-only mapping report will expand this audit.
