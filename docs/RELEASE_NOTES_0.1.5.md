# ROOMS 0.1.5 — private Apple Silicon preview

Closing a 101 table with staged tiles previously carried the draft groups into the next table. Local selections, staged groups, meld targets and dialogs now follow the authenticated seat and table/hand lifecycle. A draft group is also removed when one of its tiles leaves the private hand.

Actual packaged public acceptance reproduced the failure in 0.1.4 and passed grouping/removal and clean transitions across two successive 101 tables in 0.1.5. Typecheck, build, ARM64 packaging, all 22 bundled-file comparisons and actual launch/local playback passed. All ten actual packaged public game scenarios also passed, with zero renderer errors and exact owned-channel cleanup. General game acceptance is recorded separately in `infra/production/NATIVE_GAMES_RESULTS.json`; its version and status define the verified scope.

This remains unsigned and not notarized. Advanced native meld/pair/joker and complete-hand coverage, physical two-computer media, restrictive-network TURN/TLS, separate Agent/model/bot accounts and authorized personal providers remain acceptance gates. Windows validation is deferred. The 908-second local-playback soak applies to 0.1.4; it does not certify full-evening voice/provider performance in this build. Previously published release assets are preserved.
