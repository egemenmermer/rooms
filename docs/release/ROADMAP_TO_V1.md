# Roadmap to public V1
Planning only. No implementation began. One experienced engineer: 20–35 focused days, LOW confidence. Estimates overlap; no invented dates.
| Phase | Goal/tasks and issue IDs | Dependencies | Effort | Output and exit criteria |
|---|---|---|---|---|
| 0 Audit/baseline | This audit; record source/runtime/remote history, failures and unknowns | Current source | Completed audit | Management docs saved; source unchanged; failures unmasked |
| 1 Scope and verification baseline | Decide cuts REL-002/014; choose release branch/platform; triage REL-004/005/015 | Owner scope review | 2–4d | Approved scope and reliable green meaningful local/native smoke; toolchain risk disposition |
| 2 Core beta | Physical voice REL-001; latest social/authorization REL-006; reset REL-007; retained basic settings/actions | Phase1, two Macs/QA accounts | 5–9d | Controlled 2-Mac core workflows accepted, owner-reported mic issue resolved or precisely diagnosed; no fabricated transport |
| 3 Safe data and public obligations | REL-003/008: policies, deletion/export/retention, old state upgrade/restore | Scoped data/features; operator/legal review | 4–7d plus external waits | Data request rehearsal and compatible restore; disclosure/terms/source/asset review signed off |
| 4 Operable RC pipeline | REL-009/010/011/013: clean install/config, CI, provenance, monitoring, packaging/updater/support | Stable core/data contract; trusted signing host | 4–7d | Independently reproduced deploy/package; fresh install/update; actionable fault/backup alerts and documented rollback |
| 5 Capacity, UX and freeze | REL-012/014; six real identities, physical failure/reconnect, supported UI windows, last polish | Phase2–4, staging | 3–5d | Supported target met, no data/capture leak; owner accepts retained UX; source freeze and v1.0.0-rc candidate |
| 6 RC → public | Frozen artifact rerun critical QA, checksums/signatures, gate review, publication/rollback rehearsal | All P0/P1 closed | Included final validation/contingency | Zero open blockers; identical tested/published artifact; controlled public release after explicit later authorization |
| 7 Post-launch | Monitor incidents and backups; patch core regressions; review deferred scope | Released V1 | First 1–2w monitoring | Stable core usage and no unresolved severe incidents before feature expansion |

## Critical path
Scope freeze/provider cut → trustworthy current test baseline → two-physical-Mac voice + latest authenticated core → data upgrade/retention/privacy acceptance → reproducible frozen RC + fresh install/update → current soak/recovery → release gates → public publication.
A signing certificate is no longer the primary missing piece. Do not put notarization procurement on the critical path; installed notarized preview proves it exists. Old-to-new update remains open.
Calendar is controlled by physical media acceptance, latest state compatibility and privacy/legal review; adding feature engineering cannot close them.

## Parallel work, even with one developer
Core engineer: media/social failures and acceptance; operations engineer: clean provision/restore/alerts/release manifest; QA/owner: two devices, long sessions/fresh install; PM/legal: policy/retention/support/asset and provider review. These are possible workstreams, not newly authorized agents or staffing commitments.
Signing credentials stay away from untrusted tests/PR workers. Product code changes must be targeted to verified failures.
Purely cosmetic/community icon work can overlap only after core gates have an owner; it does not move release ahead.

## Exact next task
REL-001: perform controlled two-physical-Mac acceptance of preview.4’s core voice and microphone/device recovery, using disposable ordinary accounts and separate networks. First record current versions/device selection/permissions and reproduce the owner-reported failure. No changes or provider extraction required.
Expected output: timestamped A→B/B→A audible results, mute/deafen/PTT/navigation/device-loss/reconnect/capture results and defects with precise reproduction steps. Passing connected UI alone is insufficient. Any required Mac/accounts/owner participation must be arranged; audit cannot simulate them.

## Following actions in order
1. Review/approve proposed V1_SCOPE and defer extraction/Agent/providers/platforms.
2. Execute the REL-001 task above; classify any observed defect before engineering.
3. Reconcile failed DJ mock and stale desktop smoke with scoped current UI; triage dev advisories.
4. Run latest two-account social plus outsider permission/cache/logout checks.
5. Verify deployed password-reset delivery and recovery.
6. Define/rehearse deletion/export/retention and existing-state upgrade/restore.
7. Establish CI/provenance, public docs/support and minimal alerts.
8. Verify fresh Mac installer, actual Sparkle update and interruption recovery.
9. Six-user/current media soak, supported UX and RC freeze.
10. Final gate review, then separately authorized publication.
Task order reflects discoveries; phases show dependencies. Privacy/operator preparation may run alongside media acceptance. No coding follows this audit automatically.
