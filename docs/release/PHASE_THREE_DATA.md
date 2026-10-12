# Private release phase three — data compatibility

## Before repair — 2026-10-12

REL-008 confirmed source gap: PostgreSQL load/list returns arbitrary JSONB as StoredRoom with no validation/version; FileActivityRepository performs only shallow room/events/receipts checks. Unknown future snapshots or malformed poll/board state can be treated as current durable data. Expected: versioned reading that preserves supported legacy state and fails without resetting/writing unsupported data. Existing deployments have an unversioned top-level {snapshot,events,receipts,game?,gameArchives?} record. Preserve that shape for backward compatibility; never bulk-edit production during this local work.

Local checks use synthetic historical-format snapshots and disposable storage only. Actual oldest production snapshots, current encrypted backup/objects/ledger restore, normal-user/outsider social acceptance, delivered password-reset mail/session revocation and private export/deletion rehearsal remain separate unclosed gates. Existing accounts, data and Hoppers are not test fixtures.

## Implemented local compatibility boundary

Storage version1 retains the existing top-level shape. Supported unversioned records are validated and receive schemaVersion1 in memory; no load-time database/file migration or reset. Normal writes add the version. Unknown versions, malformed nested core structures and room-ID mismatch fail without writes; duplicate file room records are refused. Extension fields and existing game/history/archives are preserved. Game engine payloads are preserved and require a present engine for active games, but this is **structural validation**, not proof of every historical card/rule invariant.

Eight focused compatibility tests cover poll/board/receipts, extension preservation, no read rewrite, failed-save byte preservation, duplicate records and all four retained game table/history formats. Current actual archived production snapshots still need isolated acceptance; do not call every historical revision supported.

Disposable PostgreSQL16 HTTP fixture: PASS poll vote and idempotency receipts across service/pool restart; unknown-version row refused without alteration. pg_dump custom archive restored to a separate empty database; state SHA256 identical before/after, poll/receipt reads validated. Cluster was stopped and removed. Auth was QA fixtures and data synthetic; no production backup, uploads/Mongo/ledger or production RPO/RTO is certified. Initial local wrapper build failed because top-level await used CJS; wrapper was corrected before database work. Private logs: .local/production-continuation/pg-restore.log and data-compatibility.log.

Current disposable authenticated desktop fixture configuration is absent. Ordinary-user/outsider, actual reset-email/session revocation, current production backup restore and supervised private export/deletion remain OPEN. These will use a named isolated QA community/accounts and an isolated restore target, preserving existing data/Hoppers.
