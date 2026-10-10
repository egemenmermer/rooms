# Production onboarding implementation and QA

Date: 2026-10-10. Designer implementation: Astra / high delegated UI role. Platform: macOS, Apple Silicon (`darwin`, `arm64`). No Windows validation is claimed.

## Scope and references

Read `AGENTS.md`, the complete `docs/reference/ROOMS_DESKTOP_MASTER_PROMPT.md`, both visual-reference files, `docs/MILESTONES_0_3.md`, and `docs/REMAINING_PHASES_PLAN.md`. Inspected the actual Apple TV Search image and the macOS Tahoe Music image linked by the reference gallery. The design uses original restrained surfaces, a clear title hierarchy, calm spacing, and a subtle highlighted access control; reference artwork is not shipped.

Owned changes:

- `apps/desktop/src/ConnectionPane.tsx`: production URL fallback when no stored preference; working production/local/custom server choices; clear existing-account and invitation registration paths; separate optional account invite; preserved invite fields across access changes; trimmed non-secret fields; guarded submits; disabled busy inputs; focused errors; retryable invitation acceptance after a successful login; invite query cleanup only after successful acceptance; logout failures surfaced.
- `apps/desktop/src/Invite.tsx`: clear sign-in versus new-account actions; actual invite inspection with reset/retry/error states; loading and acceptance feedback; current-server mismatch explanation; safe host rendering.
- `apps/desktop/src/onboarding.css`: scoped form and invitation styling, keyboard focus, narrow layouts, reduced-transparency fallback. Imported by both views so a cold-start invitation receives its styles before Settings loads.
- `apps/desktop/src/i18n.ts`: additional ownership authorized by the main agent; only Stoat error translation mappings were added after real QA exposed an English invalid-invitation response.

No native/backend files, main-agent acceptance scripts, credentials, or shared application CSS were modified by this UI task. No commit was created.

## Commands and outcomes

Run from the project root:

```sh
pnpm typecheck
pnpm exec vite build
node /tmp/rooms-onboarding-qa.mjs
git diff --check
```

All exited successfully. The temporary, independent Playwright Electron harness was created specifically for this task. It launches `electron .` with a unique `ROOMS_PROFILE`, operates the built real desktop application, and writes its evidence to `docs/screenshots/onboarding`. It does not read production credentials or the main agent's `.local` files. The final run profile is recorded in `docs/screenshots/onboarding/qa-result.json`.

Vite emitted the existing mixed static/dynamic import warning for `realtime.ts` and the existing large-chunk warning. These do not imply a failed build, and this UI task does not claim to resolve them.

## Verified in the running Electron application

- Fresh profile shows `https://62.238.119.134` by default.
- Production and local server buttons set their corresponding URLs. A custom HTTPS server remains editable.
- Registration entry via `access=register` works; switching to sign-in and back preserves both the community invite and optional account invite.
- Sign-in from an invitation clearly says the existing account will join that community.
- A real native request to the unreachable loopback target `http://127.0.0.1:9`, using non-account QA input, fails visibly and focuses the error. Switching access mode clears the displayed error without losing the invite.
- Keyboard Tab reaches the local server button; Enter activates it.
- The form renders at requested widths 1440, 1280, and 900 without document horizontal overflow. Narrow forms become one column.
- Reduced-effects rendering was inspected by applying the same document attributes consumed by the existing preferences UI; this is rendering coverage, not a new claim about OS accessibility settings.
- A real `rooms://invite` event with the deliberately invalid code `onboarding-qa-invalid` reaches native inspection on the production server. Rejection and retry work. After translation mapping, the actual rejection is shown in Turkish. Escape closes the dialog.
- The final run captured no renderer `pageerror` events.

## Screenshots and actual dimensions

Files are unmodified screenshots of the Electron renderer at Retina scale 2. The native display constrained the requested 900/800 heights to a 774 logical-pixel viewport at the larger widths. These must not be described as successfully captured 1440×900 or 1280×800 views.

| File | Actual PNG | Logical viewport |
| --- | --- | --- |
| `screenshots/onboarding/sign-in-1440.png` | 2880×1548 | 1440×774 |
| `screenshots/onboarding/sign-in-1280.png` | 2560×1548 | 1280×774 |
| `screenshots/onboarding/sign-in-900.png` | 1800×1400 | 900×700 |
| `screenshots/onboarding/invitation-register-1440.png` | 2880×1548 | 1440×774 |
| `screenshots/onboarding/invitation-login-1440.png` | 2880×1548 | 1440×774 |
| `screenshots/onboarding/unreachable-server-error.png` | 2880×1548 | 1440×774 |
| `screenshots/onboarding/reduced-effects.png` | 2880×1548 | 1440×774 |
| `screenshots/onboarding/invalid-invitation.png` | 2880×1548 | 1440×774 |

Visual inspection: readable hierarchy, clear selected server/access state, visible keyboard/error focus, no form horizontal clipping. The registration form is longer than the available vertical area and is reached through the existing Settings scroll container. Surrounding sample friends/spaces remain explicitly marked as local demo; they are not evidence of a real signed-in account.

## Acceptance limits

This task did not create or sign in to a real account, consume a valid invitation, verify a successful existing-account join, or run two-client transport tests. Those flows remain implemented but unverified by this designer harness and are assigned to the main agent's production acceptance work. The unchanged typed registration contract still supplies both community and optional account invitation codes. This document's PASS covers the checks explicitly listed above only. Neither Windows nor two physical Macs were tested.
