# RC.8 owner trial — not published

Owner authorization, 2026-10-14: merge the DJ correction, apply it to the live server, and install a new Mac build for owner testing. This does not authorize publishing new download/update assets to friends.

DJ source correction and controls are documented in DJ_QUEUE_SEEK_SEARCH.md: normal end-of-track completion, serialized generation fencing, current-item seeking including paused position, and bounded title search with explicit result selection. Preserve dedicated-account authorization and existing listener settings. Source also includes the previously merged post-RC.7 IPTV group-name/recovery fixes; exact live provider failure acceptance remains open.

Prior source checks:33focused tests, lint/typecheck, builds, Maven compile, exact owner playlist seeking/automatic-next/non-silent isolated SFU receipt and native labeled UI fixture PASS. PR8 exact-head hosted Mac/Ubuntu checks and GitGuardian PASS before merge. New package signing/notarization, server deployment, rollback and owner installation evidence will be recorded separately. No user logout, profile cleanup, account transfer, SMTP or Hoppers change.

Public Mac/Windows RC.7 artifacts, Sparkle feed and invitation download catalog remain unchanged. Physical Windows, two-Mac and real-user acceptance remain OPEN. Owner will test this privately installed RC.8 before any wider publication.

## Subsequent delivery and publication

The signed/notarized/stapled RC.8 was installed on the owner Mac with the previous RC.7 app preserved. Only live access/music were recreated after scoped rollback and isolated preflight; dedicated OAuth file and account data were unchanged. Owner subsequently reported “calisiyor release et” on 2026-10-14 and explicitly authorized friend publication. RC.8 is now published for signed Apple Silicon macOS and unsigned verified Windows x64, with the existing invitation catalog and Sparkle history preserved. See RC_0_1_18_8_RESULTS.json and RC_0_1_18_8_NOTES.md. Broader physical acceptance remains open.
