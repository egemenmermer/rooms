# S67 notification and desktop reference follow-up

Root reviewed all four original PNGs, then the actual integrated application states. No record is visually accepted.

## Implemented projection

- Strict DEV-only default/muted/system_permission/tray fixtures reuse actual Settings, channel mute and window-policy controls via explicitly injected, isolated in-memory adapters. They do not install or overwrite a global native bridge.
- Captures refuse unknown states. Production output contains no notification fixture variant/guard markers. Native preference mutations remain blocked in fixture windows.
- The unavailable-system state deliberately describes a development example rather than claiming an observed macOS permission. Native Notification.isSupported is availability, not proof of OS authorization.
- A real Menu options disclosure opens a focus-contained, dismissible dialog explaining existing native Open/Quit commands. Microphone, leave and notification pause commands are explicitly absent rather than simulated.
- The channel selector and mute switch now share one compact row. Controls remain accessible through their names.

## Observed evidence

Final production build session22291 exited0, including TypeScript, Vite, notices126 and Electron. Existing chunk warnings remain. Eight focused fixture/channel/window UI tests passed session98670. Earlier native policy/notification checks24/24 passed session52475 before the final presentation-only adjustment. Actual Chromium interaction session10299 changed sound, channel mute and keep-open values, then opened/closed the menu dialog; nativeBridgePresent=false.

Four final1440×900,2× app capture receipts report loaded Inter, no horizontal overflow and zero runtime errors. Original images were opened, and all app states viewed; the final tray/system images were viewed again after converting tray disclosure to a modal and applying warning styling. Receipt files are in evidence/2026-10-11/notifications; images/source manifests remain in .local/design-review/evidence/S67-*.

- default: 2026-10-11T09:15:12.461Z, source c4ebcb31e24bb62b5b9ad5bebe5a7ecf82a84eeef2a80f352c66fbce0fedce57
- muted: 2026-10-11T09:15:13.855Z, source c4ebcb31e24bb62b5b9ad5bebe5a7ecf82a84eeef2a80f352c66fbce0fedce57
- system_permission: 2026-10-11T09:14:29.674Z, source c4ebcb31e24bb62b5b9ad5bebe5a7ecf82a84eeef2a80f352c66fbce0fedce57
- tray: 2026-10-11T09:14:29.485Z, source c4ebcb31e24bb62b5b9ad5bebe5a7ecf82a84eeef2a80f352c66fbce0fedce57

## Remaining differences and gates

Toolbar title/actions, sidebar population/spacing, rail artwork, footer and vertical rhythm differ. The content-free notification preview deliberately omits names/messages. Original default/permission states use mention-only policy; current native filtering supports mute/all only. The native tray supports Open/Quit only; missing microphone/leave/pause commands remain implementation work. Tray modal dimensions/menu detail differ. The OS permission banner is an isolated capability example, not a certified system permission query. Platform permission, sound, tray, dialog, actual call, gateway and two-client acceptance remain open. No deployment, release, main merge or Hoppers change occurred.
