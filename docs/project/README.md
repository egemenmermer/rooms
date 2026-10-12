# ROOMS project handbook
ROOMS is a Turkish, macOS-first desktop application for private communities: conversation, persistent voice, screen/camera sharing and shared Activities. The desktop is Electron + React; social authority is unmodified upstream Stoat, realtime media is replaceable LiveKit, and shared state is owned by a ROOMS Activity service.

This handbook describes the audited implementation at **06f5477 on codex/reference-package**, dated **2026-10-12**. It is an architecture explanation, not a declaration that every feature is accepted for public release. The installed preview at the audit was **0.1.17-preview.4**. Documentation may be merged independently of product changes; check the implementation branch before relying on a described module.

## Start here
1. [Architecture and boundaries](architecture.md): components, topology, ownership and design tradeoffs.
2. [How the application works](runtime-flows.md): startup, accounts, chat, voice, Activities, providers and updates.
3. [Services and interfaces](services.md): protocol responsibilities and API families.
4. [Data and persistence](data.md): authoritative stores, caches, private state and recovery.
5. [Security and privacy model](security.md): trust boundaries, permissions and limits.
6. [Deployment and operations](operations.md): dedicated core, separate Agent, certificates, backups and incidents.
7. [Development and release](development.md): checkout/setup, scripts, testing and package delivery.
8. [Repository guide and extension rules](repository.md): where code lives and how to change it safely.

## What runs where
| Location | Responsibility |
|---|---|
| User’s Mac | Desktop UI, selected devices/files, private credentials, personal media, preferences |
| Dedicated ROOMS core | Stoat social stack, access/registration broker, Activity state, LiveKit transport, music worker |
| Separate optional Linux Agent host | Scoped tasks, models, connectors, workers/browser, reminders and operation journals |
| Static documentation origin | Explanatory pages only; no account database, credentials, command execution or privileged browser bridge |

## Product identity
Community text and voice are the foundation. Voice belongs to a persistent transport, not the screen being viewed. An Activity is a separate room experience: changing or ending it should not disconnect voice. Personal media is private to each owner; sharing metadata or a screen does not authorize sharing provider accounts or source credentials.

The repository also includes games, personal providers, an Agent and design/reference fixtures. Their existence does not imply production acceptance. The private GitHub release audit identifies scope cuts, blockers and required evidence.

## Evidence vocabulary
**Implemented**: code exists and is connected at the described layer.
**Verified locally**: a specific local check passed; its fixture or hardware limits remain explicit.
**Historical acceptance**: a recorded older build/workflow passed.
**Current end-to-end acceptance**: the exact release and real users/devices/services passed the relevant journey.
**Unknown**: not established by available evidence.

No E2EE, broad Windows acceptance, unlimited room capacity or “every integration works” claim is made. Website content is deliberately limited to explanatory project chapters; private release findings and operator records remain in the private repository.
