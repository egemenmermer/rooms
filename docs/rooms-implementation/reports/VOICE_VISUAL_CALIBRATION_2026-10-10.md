# S19 / S20 visual calibration — 2026-10-10

Bounded GPT-6.1 Sol continuation. Only `apps/desktop/src/reference-voice.css` and this report were edited. No edits or commits occurred before the task interruption. No tracker, renderer logic, fixture state or transport files were changed. No broad tests, type checks or builds were run by this agent.

## References and corrections

Opened the original `S19_voice_room__empty.png` and `S20_video_room__focus.png` beside the app's current captures at 1440×900, device scale 2. Consulted immutable prototype measurements in `05_prototype/media.css` and `styles.css` without modifying or shipping the prototype.

- S19: empty-state heading now uses the reference's 21px / 630 weight / −0.4px tracking; the internal column gap is 11px, the 40px icon has 4px bottom spacing, paragraph line-height is 1.7 with reference secondary color, and the join control is 36px high. The inner group's positional offset is −1px. These remove the previously heavier heading and lower paragraph/control placement.
- S20: focus-strip labels now use 12px / 400 weight, 6px×9px padding and 10px left/bottom inset, matching the reference video-name measurement. Camera-off secondary text uses the same 12px size, avoiding undersized Can labels. The actual camera-off state remains unchanged.

## Fresh local evidence

Ran only the bounded exact captures:

```text
node scripts/capture-reference.mjs S19 empty 1440 900 /voice
node scripts/capture-reference.mjs S20 focus 1440 900 /voice
```

Latest images and receipts: `.local/design-review/evidence/S19-empty/application.png`, `S19-empty/capture.json`, `S20-focus/application.png`, `S20-focus/capture.json`. Each capture command exited 0. Receipts report loaded Inter, no document-width overflow and no page errors. The fresh images were opened after calibration. Receipts remain `CAPTURED_NOT_VISUALLY_ACCEPTED`; root must review them, and owner acceptance remains outstanding.

## Remaining differences and honest gates

- Browser captures intentionally show the development DEMO label and omit native macOS traffic lights. These are local fixtures, not live social or media evidence.
- S20 fixture camera artwork differs from original prototype scene art; it does not represent a live video stream. No production camera images or synthetic users were introduced.
- The original S20 headline is a slogan; the app retains the owner's utilitarian room title `Salon`. Its local fixture keeps one coherent Zeynep microphone state rather than duplicating the reference's contradictory sidebar-muted / tile-unmuted indicators.
- Shared toolbar, rail, sidebar row spacing and connected-voice block still differ from originals; those are outside this CSS ownership. The S20 dock includes direct Soundboard and More controls, so its total width/order differs from the original dock. No controls were removed here.
- S19 main outer card geometry is close; its internal text/icon alignment should receive root review before visual acceptance. S20 grid position differs slightly, and original presence-dot appearance is not reproduced by this scoped edit.
- Native window behavior, actual account permissions, speaking indicators with real microphone input, camera-device behavior, two-client media transport and physical Windows/macOS acceptance remain separate unverified gates. These two captures do not certify other S19/S20 variants or responsive sizes.

No push, release, remote mutation or deployment occurred.
