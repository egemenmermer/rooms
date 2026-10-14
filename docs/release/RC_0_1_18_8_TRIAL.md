# RC.8 owner trial — not published

Owner authorization, 2026-10-14: merge the DJ correction, apply it to the live server, and install a new Mac build for owner testing. This does not authorize publishing new download/update assets to friends.

DJ source correction and controls are documented in DJ_QUEUE_SEEK_SEARCH.md: normal end-of-track completion, serialized generation fencing, current-item seeking including paused position, and bounded title search with explicit result selection. Preserve dedicated-account authorization and existing listener settings. Source also includes the previously merged post-RC.7 IPTV group-name/recovery fixes; exact live provider failure acceptance remains open.

Prior source checks:33focused tests, lint/typecheck, builds, Maven compile, exact owner playlist seeking/automatic-next/non-silent isolated SFU receipt and native labeled UI fixture PASS. PR8 exact-head hosted Mac/Ubuntu checks and GitGuardian PASS before merge. New package signing/notarization, server deployment, rollback and owner installation evidence will be recorded separately. No user logout, profile cleanup, account transfer, SMTP or Hoppers change.

Public Mac/Windows RC.7 artifacts, Sparkle feed and invitation download catalog remain unchanged. Physical Windows, two-Mac and real-user acceptance remain OPEN. Owner will test this privately installed RC.8 before any wider publication.
