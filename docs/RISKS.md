# Risks and validation boundaries

| Risk | Mitigation / acceptance |
| --- | --- |
| Spacebar compatibility varies from Discord | Pin upstream commit; exercise auth, invites, HTTP permissions and real Gateway events. No compatibility claims from naming alone. |
| AGPL upstream license | Preserve upstream license/source attribution and source availability. No upstream fork. Review combined distribution before public release. |
| Capture permissions and system audio differ by macOS version | Explicit picker/preflight; real-machine test; disable unsupported audio, never bypass consent/DRM. |
| Voice displayed as connected before transport | Derive UI only from actual provider state; demo states explicitly say no audio connection. |
| Stale identity / revoked channel access | Access broker revalidates permissions before grants, removal disconnects participants, full reconnect needs fresh grant. Already-issued JWTs remain reusable up to five minutes; production revocation acceptance is outstanding. |
| Credential leakage | Main-process vault; no tokens in DOM/localStorage/logs/diagnostics; no provider tokens in shared room state. |
| M1/8 GB performance | Limit backdrop blur, lazy-load Cinema, cap loaded conversation history, stop inactive animation; measure all Electron processes. |
| Local two-client tests overstate deployment readiness | Record single-host scope; require separate-machine capture/audio/TURN testing for deployment claims. |
| Unsigned development package | Label unsigned/unnotarized; no production-release assertion. Signing/updater belongs to M7. |
| Empty external infrastructure | Implement/reproduce local environment; mark unavailable production domains, secrets and platform tests as blockers. |
