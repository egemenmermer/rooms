# Proposed complete V1 scope
This is the audit recommendation for owner review, not an already-approved implementation change. No features were disabled or removed during the audit.

## V1 MUST SHIP
- Publicly downloadable, signed/notarized macOS 14+ ARM64 client; honest platform limits and private invite-only communities. Public release need not mean unrestricted account signup.
- Welcome → expiring one-use invite → account creation/join → profile → home. Clear invalid/used/expired invite and uncertain signup recovery. Login, safe remember-session, logout, expired-session and proven password-reset/support fallback.
- Real community/channel list, text messages/history/pagination, send/edit/delete, bounded uploads with clear failure state, DMs, friends/request accept/reject/remove/block, profile/avatar and honest presence.
- One persistent voice room per user, actual audible microphone, mute/deafen, device selection and missing-device recovery, leave, participant/local gain and accurate connected/reconnecting/offline states.
- Opt-in camera/screen sharing as supported on target Mac, explicit source consent, stop/navigation/logout/revocation cleanup; system audio enabled only after physical verification, otherwise explicitly unavailable.
- Community owner basics: create/rename/delete community/channel as supported, remove/ban/block abusive users, enforce view/connect/speak permissions. No requirement for every reference editor.
- One small complete shared Activity: polls and a basic collaborative board (existing authoritative implementation), with host/membership boundaries, persistence/rejoin, clear failures. Games are optional later.
- Keyboard/focus/900x700-to-large-window access, reduced-motion/transparency, settings Save/Discard/restart persistence, readable error/empty/loading states.
- Data safety: private server isolation, explicit no-E2EE claim, disclosures of server trust/storage, retention/export/deletion/support operations, minimal abuse response.
- Operable production configuration, repeatable install/upgrade/restore/rollback, monitoring and alerts, known capacity, fresh installer and signed update acceptance, source/tag/version/service provenance.
- Public privacy/terms/support/download/release notes and reviewed third-party source/asset licensing.

## V1 SHOULD SHIP, only after MUST gates
Native opt-in notifications/channel mute, tray/startup preferences, local user-owned Cinema with common MP4/WebM and subtitle files; safe sanitized diagnostics.
If a retained secondary feature cannot pass its acceptance, defer it and remove its entry points from the V1 release. Do not ship enabled inert controls.

## V1 NICE TO HAVE
One game, preferably basic Holdem, if complete packaged human sessions and restart/recovery can be demonstrated within a 2-day discretionary cap. Otherwise defer all games. Cosmetic consistency within current design; no pixel-for-pixel 413-state acceptance.

## POST-LAUNCH
Separate Agent/tasks/models/connectors/reminders/memory/YOLO; advanced games/all Batak/101 rules; private calls; official YouTube Together re-exposed as a coherent permitted player flow; personal IPTV/Xtream/XMLTV/Real-Debrid; Windows and Intel Mac; capacity expansion.
Private calls duplicate the core voice requirement and lack newest physical acceptance. Media providers introduce account/codec/rights gates. Agent adds a separate security/operations product.

## CUT / REMOVE from the public V1 surface
YouTube extracted/audio-rebroadcast bot pending documented provider and content permissions; Spotify audio bot; current Recep clip pending distribution rights; unconfigured Agent/provider panels and unreleasable future controls; legacy Spacebar commands from current onboarding; synthetic data/development fixture routes from production.
Do not delete useful historical evidence or working code solely to reduce scope. Scope controls must gate routes, menus, shortcuts and notifications together in a future implementation.
Current /youtube points to the DJ popup, not the older official player: deferring the bot also requires an honest decision about together watching. Keep screen-sharing as the V1 together experience; do not imply the old video screen is reachable.
Real-Debrid registration was already deferred by owner. Do not undo that decision.

## EXPERIMENTAL
Exact reference variants, DEV fixtures, external agent browser/egress, provider source extractors and unsupported capture combinations. Keep separate from user-facing release claims.
Initial capacity target is one core community room with six real identities/clients, single Activity writer; measured acceptance must precede any published guarantee. No horizontal clustering, monetization or public marketplace in V1.
