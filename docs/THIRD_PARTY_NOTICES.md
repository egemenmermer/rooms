# Third-party notices and source references

ROOMS uses the owner-approved original ROOMS Design Package brand/vector assets. Development reference fixtures and artwork are excluded from the production bundle. Apple/Discord screenshots in docs/reference remain external private-study references and are not distributed as product assets. The bundled Inter font is licensed under SIL Open Font License 1.1; its complete notice is included at reference-brand/fonts/OFL-Inter.txt. No proprietary Apple font is bundled.

Dependencies retain their own licenses. Consult the corresponding installed LICENSE files and lockfile for exact versions. The build generates dist/THIRD_PARTY_NOTICES.txt from installed production dependency metadata and LICENSE/NOTICE files; this is bundled in app.asar. Deployment images and official CLIs retain their upstream notices separately.

- Electron / MIT: https://github.com/electron/electron
- React / MIT: https://github.com/facebook/react
- TypeScript / Apache-2.0: https://github.com/microsoft/TypeScript
- LiveKit client/server SDKs / Apache-2.0: https://github.com/livekit/client-sdk-js and https://github.com/livekit/server-sdk-js
- hls.js / Apache-2.0: https://github.com/video-dev/hls.js
- Fastify / MIT: https://github.com/fastify/fastify
- PostgreSQL node driver / MIT: https://github.com/brianc/node-postgres
- MongoDB Node driver / Apache-2.0: https://github.com/mongodb/node-mongodb-native
- Lucide / ISC: https://github.com/lucide-icons/lucide
- Playwright / Apache-2.0: https://github.com/microsoft/playwright

Unmodified self-hosted Stoat and its official self-hosted configuration are separate upstream AGPL-3.0 components: https://github.com/stoatchat/stoatchat and https://github.com/stoatchat/self-hosted. See infra/stoat/README.md and local setup pin/evidence for the exact image/upstream revisions. Keep corresponding source and license links available to users. Review applicable source-distribution obligations before release; separation of processes is not itself a legal conclusion.

The legacy Spacebar integration remains source/evidence for rollback and is not the active new backend: https://github.com/spacebarchat/server (AGPL-3.0).

The remote worker installs unmodified official Codex and Claude Code CLIs. Their usage/authentication terms are independent of ROOMS; each initiating person uses their own eligible provider account. Do not distribute cached auth material. The official YouTube IFrame player keeps its branding/controls and loads from its permitted origin; no scraped media or redistributed streams are bundled.

- Inter / SIL Open Font License 1.1: https://github.com/rsms/inter. Full license is bundled with the font and generated notices.
