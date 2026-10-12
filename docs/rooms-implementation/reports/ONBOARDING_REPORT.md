# S01–S07 onboarding implementation report

Date: 2026-10-10. Scope: ConnectionPane.tsx, ReferenceOnboarding.tsx, reference-onboarding.css. Root owns routing, tokens, native bridge, fixture controls, integrated screenshots and QA.

## Sources reviewed

Read the repository brief/checkpoint/decisions, applicable progress records, master prompt and both visual-reference documents. Read the immutable package screen inventory, prototype social.js/auth styles, and F01 invitation/account/profile/device journey in 06_handoff/flows.json. All 23 assigned original PNGs were opened with the image viewer (not thumbnails):

- S01_welcome.png
- S02_sign_in.png, S02_sign_in__invalid.png, S02_sign_in__loading.png, S02_sign_in__offline.png, S02_sign_in__password.png
- S03_invite_registration.png, S03_invite_registration__invalid.png, S03_invite_registration__used.png
- S04_account_recovery.png, S04_account_recovery__expired.png, S04_account_recovery__reset.png, S04_account_recovery__sent.png
- S05_community_invite.png, S05_community_invite__expired.png, S05_community_invite__limit.png, S05_community_invite__revoked.png
- S06_first_profile.png, S06_first_profile__avatar.png
- S07_device_setup.png, S07_device_setup__denied.png, S07_device_setup__granted.png, S07_device_setup__test.png

Exact newer approved reference copy takes precedence over the older utilitarian-copy preference for the visible welcome artwork and headings. No additional marketing copy was invented. Ece/Deniz/Can sample presence, credentials, invitation/member counts and synthetic profile choices are not production data and are omitted.

## Implementation and state coverage

| ID | Reviewed variants | Implemented behavior | Status / gap |
|---|---|---|---|
| S01 | default | Split auth frame, reference wordmark/art sculpture/copy, real sign-in and invitation route callbacks | NEEDS_RECHECK: integrated route/capture outstanding; prototype demo card and disclaimer deliberately excluded from production |
| S02 | default/loading/invalid/offline/password | Native Stoat login through existing secure adapter; masked/reveal password; busy fieldset; retained input on failed auth; focusable actual server errors; navigation to recovery/registration; configurable actual server and optional invite | NEEDS_RECHECK: exact error/offline variants depend on real native result; remember checkbox is checked/disabled with precise secure-storage reason because native API has no per-login remember opt-out; no fake sample credentials |
| S03 | default/invalid/used | Actual registration bridge, real username/community-invite/account-invite inputs, backend errors, native session guard before completing navigation | NEEDS_RECHECK: backend does not expose separate account-invite inspection, so no fake validated banner or invalid/used distinction; existing native minimum 8 characters preserved; no unsupported terms-consent assertion |
| S04 | default/sent/reset/expired | Reference default recovery frame and email input, disabled recovery action with precise missing native API reason, working return to sign-in | BLOCKED_SERVICE: secure recovery/send/reset/expired-session APIs unavailable; sent/reset success and expired session never synthesized |
| S05 | default/expired/revoked/limit | Read-only native invite inspection on explicit form submission; actual space/channel name; actual expiration timestamp check; explicit actual acceptance for matching signed-in server; sign-in/register/account-change routes | NEEDS_RECHECK: revoked/limit error copy uses actual backend message; no adapter-supported inviter/member counts or real face pile; invalid invitations show focusable error and can retry |
| S06 | default/avatar | Actual account avatar, editable display name/status, native updateProfile, native-result user update before next step, skip/continue; avatar selection opens existing profile Settings | NEEDS_RECHECK: original sample avatar grid replaced with actual profile/avatar Settings action; current status absent from SocialUser so field starts empty and is sent only when entered |
| S07 | default/denied/granted/test | Actual native captureStatus permission state; optional camera/screen rows; microphone settings/test routes open existing real Settings audio implementation; completion callback does not require media permission | NEEDS_RECHECK: device chooser/meter/test is in real audio Settings instead of synthetic inline meter; no invented MacBook device name or granted status; callback integration/capture outstanding |

## Integration contract

ReferenceOnboarding exports ReferenceOnboardingMode: welcome, signin, register, recovery, invite, profile, devices. Props: mode, onNavigate(mode), optional onComplete(), optional onOpenSettings(profile|audio). Missing callbacks disable the corresponding visible action with a precise title reason. Root must preserve setup route when closing the Settings modal, and wire final completion to the real community route.

ConnectionPane remains backward compatible without props for Home and Settings. Its optional referenceMode selects sparse reference auth markup; onAuthenticated runs only after a real native user session exists; onAccessChange and onRecovery connect local auth routes. Server/invite query state is preserved by the existing router. Registration community invitations and optional account invitations remain separate inputs. Credentials stay only in existing component state and the native secure authentication path; no password is written to URL/localStorage/report/log. Failed auth preserves the password until actual sign-in success.

Decorative artwork uses CSS geometry and the shipped reference brand SVG. Sample floating online friends are omitted. Source geometry: auth split 1.08:1, art padding41/radius21, right form390, h1 54/h2 30, canvas and Inter token fallbacks. Responsive rules collapse artwork below760. Root should check native traffic-light/titlebar composition when mounting the component.

## Evidence and remaining verification

Recorded source reads and original image-viewer calls, plus code/diff review only. No build, typecheck, automated tests, remote signup/login/invite/profile mutations or acceptance scenarios were performed by this agent. Root handles integrated authorized QA. Every new view remains awaiting screenshot comparison and owner manual acceptance; this report does not claim visual or transport acceptance. macOS target only; Windows not verified.
