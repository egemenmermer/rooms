# S51–S54 implementation report

Source implementation delivered 2026-10-10. All 31 inventory originals below were individually opened at readable resolution before implementation. Read BRIEF, CHECKPOINT, DECISIONS, HOLDEM_AUTHORITY_REPORT, GAMES_44_50_REPORT, actual game projection/command protocol, games.js S51–S54 and handoff flows. This report is source evidence only: no integrated screenshots, tests, typecheck or builds were run by this implementer. All entries require root visual/functional recheck; none is certified.

## Owned source changes
- Games.tsx and reference-games.css: S51 history route and S52 own-seat recovery.
- Together.tsx and new reference-together.css: S53 poll and S54 frame.
- Whiteboard.tsx: bounded root-approved integration for real shape rendering/edit tools, export dialog and read-only guards.
No central tracker/shared contracts/store/native/service edits.

## Entries and behavior
S51 default/loading/error/empty: /games?tab=history, reached from catalog/table History buttons. Four actual statistics cards, kind filter and completed-hand rows. Current game statistics and authorized previousTables use server snapshots only. Distinct virtual-chip payouts and game scores are not summed into fictitious monetary profit. Error and loading states use actual activity state. No seated/watcher access means no history access. No active table means current API cannot obtain archive independently: precise unfinished state.
S51 holdem/blackjack/batak/okey: row details render actual recorded result. Holdem board/payout/public evaluation only; no inferred hole cards. Blackjack returned chips and recorded outcomes only, no invented net profit/cards/bets. Batak/101 actual scores only. Archived score records omit historical seat identities; display numbered seats rather than attributing old scores to current players. Archived hand labels use actual kind because archives omit table name. Reference team/bid/last-move detail remains internally unfinished until result projection includes it.
S52 default/offline: ownRecovery is root-added typed own-seat-only projection. Modal and banner use actual connection, disconnect timestamp and takeoverAt; timer = takeoverAt minus current time minus server offset. 30s deadline denotes possible bot takeover, never a reclaim expiration. Refresh reconnects actual transport.
S52 bot/return: actual takeover/pendingReturn, native game.sit existing seat, command lock/error preserved, no buy-in argument on reconnect. Safe turn return controlled by server. On recovery completion banner disappears; no fabricated transient success banner.
S52 reclaimed: actual human recovery returns normal table, awaiting richer native event acknowledgment for matching reference's confirmation banner.
S52 timeout: no timeout-fold cause in snapshot; no claim that a folded hand timed out. Internal event projection remains unfinished, not external service blocker.
S53 default/changed/first_vote/voted_batak: /together actual polls; actual identity selection, vote counts/percentages and current participant names. Poll commands remain real, fixtures cannot dispatch. No sample movie scene/presence shipped.
S53 create: required question and 2–12 nonempty bounded options, add/remove stateful fields. Native successful result alone clears/closes form; native error retained inline and in dialog. Root requested own canCreate projection to expose pre-submit permission; server enforces current missing projection.
S53 close_confirm/closed/not_owner: real creator or current participant canControl permission, confirmation using actual leader/count, native poll.close and persistent snapshot, disabled votes once closed; Games navigation alone does not start game.
S53 empty/offline: actual empty snapshot or retained last snapshot; writes disabled disconnected, refresh available. No timer or createdAt metadata fabricated.
S54 default/empty/undo: /together?tab=board, actual persisted BoardElement snapshot; selection, pen, rectangle, ellipse, text, erase and own local-session undo. Shape rendering now handles native kinds. Pointer drawing clamps coordinates; transient drawing cancels when busy/read-only. Keyboard tools and undo exclude focused forms/dialogs/buttons. Deletions restricted own author, native authoritative validation preserved.
S54 reconnect/read_only: retained board, mutations disabled absent identity/disconnected/DEV fixture. No invented room drawing-role policy; projected granular permission remains internal TODO.
S54 export: real native SVG save via exportBoard with cancellation and explicit true acknowledgment; PNG unavailable stated precisely. Discovered native exporter currently treats shapes as polyline; root notified to fix it in its owned native code.
S54 saved: snapshot persistence is real, but named archive/title metadata is absent. Disabled saved-board archive button states internal missing capability; no fake saved acknowledgment. Explicit file-saved notice appears only native export boolean true.
S54 participant cursors: unsupported current protocol; none synthesized. Room participant display is actual snapshot membership, not voice presence.

## Integration and remaining work
Root wires existing /games and /together routes; query entries work within components. Deterministic fixture needs: actual-looking current history + previousTables, per-kind actual result schema; ownRecovery disconnect/takeover/pending/safe-return states; poll counts/creator/currentParticipant capability; shape/text BoardElements. Fixture commands remain disabled and never spoof account success.
Internal additions requested: historical seats/table names/results detailed public fields; safe timeout cause event; participant own canCreate; whiteboard granular own write capability/title/archive/cursors; native PNG and native shape SVG serialization. External integration requires actual room/account authorization and local native bridge, not an excuse to mark implementation complete.
No hidden hands emitted, no synthetic production tasks or people, no renderer credentials, no remote mutations.

## Individually reviewed originals
- S51/default: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S51_game_history.png
- S51/batak: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S51_game_history__batak.png
- S51/blackjack: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S51_game_history__blackjack.png
- S51/empty: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S51_game_history__empty.png
- S51/error: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S51_game_history__error.png
- S51/holdem: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S51_game_history__holdem.png
- S51/loading: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S51_game_history__loading.png
- S51/okey: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S51_game_history__okey.png
- S52/default: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S52_game_reconnect_bot_takeover.png
- S52/bot: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S52_game_reconnect_bot_takeover__bot.png
- S52/offline: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S52_game_reconnect_bot_takeover__offline.png
- S52/reclaimed: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S52_game_reconnect_bot_takeover__reclaimed.png
- S52/return: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S52_game_reconnect_bot_takeover__return.png
- S52/timeout: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S52_game_reconnect_bot_takeover__timeout.png
- S53/default: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S53_room_poll.png
- S53/changed: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S53_room_poll__changed.png
- S53/close_confirm: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S53_room_poll__close_confirm.png
- S53/closed: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S53_room_poll__closed.png
- S53/create: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S53_room_poll__create.png
- S53/empty: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S53_room_poll__empty.png
- S53/first_vote: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S53_room_poll__first_vote.png
- S53/not_owner: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S53_room_poll__not_owner.png
- S53/offline: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S53_room_poll__offline.png
- S53/voted_batak: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S53_room_poll__voted_batak.png
- S54/default: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S54_collaborative_whiteboard.png
- S54/empty: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S54_collaborative_whiteboard__empty.png
- S54/export: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S54_collaborative_whiteboard__export.png
- S54/read_only: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S54_collaborative_whiteboard__read_only.png
- S54/reconnect: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S54_collaborative_whiteboard__reconnect.png
- S54/saved: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S54_collaborative_whiteboard__saved.png
- S54/undo: /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S54_collaborative_whiteboard__undo.png

## Additive authoritative integration follow-up
After GAME_HISTORY_RECOVERY_REPORT contract delivery, Games.tsx now consumes captured history `seats.position`, `tableName`, public player net/card/bet/dealer details, publicly revealed Holdem hands, Batak contracts/tricks/teams, and 101 final discard. Missing legacy seat metadata stays absent; current seat/community identities no longer assign historical results. Historic entries show actual payout when net was not recorded, and net only when explicit public `players.net` is present.
Own recovery events use stable ID, timestamp and hand number. Actual control-returned and turn-timeout check/fold/other-action explanation persist as recorded events rather than fabricated transient successes; dismissal deduplicates by ID per current identity/table. Existing recovery countdown is only takeover timing.
Games DEV-only lazy metadata hook consumes create/variant/folding/team, rules/raise/buy-in/history detail/recovery modal and Okey draft selection/groups/process intent. It never changes native command guards. Exact fixture UI initialization remains awaiting coordinator checks/captures. Together/Whiteboard metadata initialization belongs to root. No new checks run by this implementer.
