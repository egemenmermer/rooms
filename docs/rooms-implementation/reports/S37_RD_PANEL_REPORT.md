# S37 Real-Debrid connection panel

Date: 2026-10-11. Scope: new stateless renderer component, its scoped stylesheet and local presentation tests. Root owns the existing integration, contracts, fixtures, capture and tracker files. No provider request, remote mutation, release or commit was performed by this implementer.

## Original reference review

The following immutable 2880×1800 originals were individually opened with `view_image` (1440×900 logical viewport, 2× export):

- `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S37_real_debrid_connection.png`
- `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S37_real_debrid_connection__waiting.png`
- `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S37_real_debrid_connection__expired.png`
- `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S37_real_debrid_connection__cancelled.png`
- `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S37_real_debrid_connection__connected.png`
- `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S37_real_debrid_connection__error.png`

Reviewed the project instructions, master brief and both visual-reference files, implementation brief/decisions, milestone/continuation plan, checkpoint and S37 progress records. Existing `Modal`, personal-media/native device-grant integration and scoped media stylesheet were inspected read-only.

All six originals share the centered approximately 593px modal, 26px horizontal body inset, divided header/footer, restrained violet controls, opaque charcoal body and semantic status coloring. Default has a provider card and personal-account details. Waiting replaces the introduction with a three-step indicator, code box, pending notice and provider-page action. Expired/error use amber notices. Cancelled uses a substantial dashed-border empty panel. Connected uses a compact connection row, status pill and library/remove actions. These state-specific structures are implemented as HTML/CSS; no reference image is shipped.

## Integration contract

`ReferenceRDConnection` and `ReferenceRDConnectionProps` are exported from `apps/desktop/src/ReferenceRDConnection.tsx`.

```ts
interface ReferenceRDConnectionProps {
    state: 'initial' | 'waiting' | 'connected' | 'expired' | 'cancelled' | 'error';
    grant: { userCode: string; verificationUrl: string; expiresAt: string } | null;
    busy: boolean;
    available: boolean;
    canCancel: boolean;
    error: string | null;
    onStart(): void;
    onCancel(): void;
    onClose(): void;
    onOpenLibrary(): void;
    onRemove(): void;
}
```

Render inside the existing `Modal` with `className="ref-media-modal rd"` and the existing personal RD title. The component supplies body/footer only, imports its own scoped CSS and expects the parent's existing `reference-media.css` for modal/button primitives. It uses `useId` only for accessible descriptions; there is no local authorization state, timer, polling, bridge, network call, auto-open or simulated success. Callback completion cannot change its presentation until the parent supplies new props. Parent cancellation/readback and current ownership remain authoritative.

The waiting code preserves `ref-media-code` for the existing capture contract. Existing action labels are preserved for start, stop-checking and open-library. Provider anchors use `tabIndex=0` so the existing Modal selector includes them in its focus cycle. Parent owns close/escape behavior; the component does not add a second dialog or focus trap.

## Deliberate differences from prototype

- Removed prototype disclaimers and simulated approval action. No promotional or generic filler is substituted, so some modal heights are intentionally shorter than the originals.
- Waiting displays only the passed nonempty bounded device code and parseable actual absolute expiry. No sample code, fabricated five-minute duration or advancing timer/stages. Parent owns actual expiry transitions. Missing/malformed grants hide both code and stepper and expose a recovery reason.
- The external link exists only for the native contract's exact `https://real-debrid.com/device` URL. `about:blank`, arbitrary hosts, non-HTTPS and query-bearing variants create disabled controls with a visible explanation. It is never invented from a missing grant. Busy/unavailable state also disables external navigation.
- Cancellation describes stopping ROOMS consumption and explicitly states the upstream code can remain valid. It does not claim upstream revocation or absence of previously saved content.
- No invented connected account name. Connected status comes solely from the parent; library/removal use the supplied real callbacks. No unauthorized shared-content implication.
- State transitions are represented by distinct body hierarchy; terminal states do not retain the initial introduction or stale authorization code. Errors are rendered as literal text.
- Disabled actions have a visible reason and a title/accessible description. Responsive styles wrap actions, code and status content; the narrow stepper stacks labels. There are no new animations.

## Executed local checks

Command (twice; second run after integration-label adjustments):

```sh
pnpm exec vitest run --config vitest.config.ts tests/reference-rd-connection.test.tsx
```

Final result at 02:53:18 local: **1 test file, 24 tests passed**, exit 0; Vitest reported 1.72s. Coverage includes all six states, all five callback types, no self-transition, actual grant/expiry rendering, no stale grant in terminal states, busy/unavailable/cancel-capability disabling, literal errors, missing/malformed grants, rejected external URLs including DEV `about:blank`, and existing Modal focus-cycle/Escape interaction. Only deterministic jsdom presentation checks were run.

## Remaining gates

Root integration, fresh exact six-state captures and original/actual visual comparison remain required. No integrated build, typecheck, full suite, browser capture, native focus acceptance, real RD authorization/cancellation/library/removal, physical device, provider-account, Windows or owner manual acceptance is claimed by this report. Local presentation checks are not native transport or provider verification. All records remain awaiting root review and owner acceptance.

## Root integration follow-up

Root integrated the released component into PersonalMedia's real native lifecycle. Start and poll failures enter an explicit error state; pending polling failures stop ROOMS grant consumption. Connected state requires current owned status readback after the native connection receipt. Cancellation waits for its native receipt; connected removal opens the existing actual confirmation dialog and mutates only after confirmation. Three integration regressions cover successful readback, failed readback and confirmation-first removal, bringing route/import/readback checks to18. The24 panel checks are included in the full503 pass. Root opened all six originals and all six exact integrated captures. Final sorted-source receipts bind to commit8b03fdd and are archived under evidence/2026-10-11/personal-metadata/. See PERSONAL_MEDIA_METADATA_INTEGRATION.md; no provider/owner visual acceptance is certified.
