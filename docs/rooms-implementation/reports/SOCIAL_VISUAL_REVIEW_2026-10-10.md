# S12–S18 visual comparison and correction log

Status: all 24 inventoried application screenshots were compared with their matching immutable original PNGs by a GPT-6.1 Sol read-only reviewer. This report is not acceptance; records remain `NEEDS_RECHECK`. The reviewer changed no files and ran no tests, build, or capture.

## Findings

- **S12:** personal navigation labels/avatars and the voice card were horizontally centered by a shared flex rule; the relationship banner lacked a leading icon and placed its action at the far edge. The composer/relationship block and shared-files inspector spacing need another exact capture.
- **S13:** message/files/quick-switch modals were too tall, while the empty modal was too short. Result avatars/text began too far left. Fixture-only scope and demo labels duplicated the global DEV marker.
- **S14:** file tiles sat lower and were taller than the reference; document and board artwork differs. The preview modal and illustration geometry are close. Truthful disabled upload/error states were not counted as visual failures.
- **S15:** expanded biography fields collapsed into one line; banner/avatar/name groups sit low in some variants.
- **S16:** title and tabs sit low; notification row spacing accumulates height, and the empty group is low. Reference action hierarchy uses the accent for Cinema only.
- **S17–S18:** create/edit dialogs are materially taller than the originals, especially channel delete. Dense form layout and field text weight require correction while preserving local-only and disabled explanations.

## Root corrections applied

- Fixed `ReferenceIcon`, DM avatar and voice-card flex sizing and tightened personal-sidebar section spacing.
- Added a leading shield icon to the S12 relationship banner and changed its action layout to follow the message.
- Removed the redundant fixture-only search scope line and in-modal demo label. The app-level DEV badge remains visible; production retains the actual loaded-channel scope notice.
- Hid S14 fixture-only download/context affordances that were disabled and absent from the reference.
- Preserved newlines in the S15 expanded profile.
- Added optional exact relative timestamp labels and the accent action style for the local S16 activity row.

## Pending

`settings_reference` (GPT-6.1 Sol) is adjusting only `apps/desktop/src/reference-community-settings.css` for S16–S18 geometry. Root must recapture and visually recheck all 24 variants after that change, then record actual local verification. No real server data, notification feed, private ACL or creation result is simulated in production.
