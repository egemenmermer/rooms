# Game / poll / board fixture source contract

Delivered 2026-10-10. Owned new `apps/desktop/src/dev/games-fixture.ts` only, plus this report. Read existing media-fixture, runtime-sources, activity hook, exact PROGRESS inventory and Games implementation reports. All S40–54 originals were individually reviewed during the preceding screen batches; paths remain fully enumerated in GAMES_40_43_REPORT, GAMES_44_50_REPORT, GAMES_51_54_REPORT. No build, tests, typecheck, capture or remote operation was run by this implementer.

## Exports and installation
- `gameFixtureVariants` contains exact inventory screen/variant keys, including S42/S49 responsive keys.
- `getGamesFixtureMetadata(id, variant)` validates both keys and returns `id, variant, demo:true, label, route, status, error, ui, pendingIntegration, unsupportedReason`.
- `createGamesFixtureProjection` returns `{metadata, room, serverTimeMs}` with bounded public sample projections.
- `installGamesFixture(id, variant, {initialUIIntegrated,initialActivityStatusIntegrated})` validates before installing isolated media/activity adapters. Initial UI/status flags must be explicitly enabled only after the corresponding root integration exists. Absent flags throw precise unsupported-currently errors. Root supplies the common reference social shell explicitly; this module never chooses a fallback screen.
- Installer returns idempotent cleanup. It restores prior private runtime, isolated media runtime/voice context and the prior demo DOM tag in reverse order. No native bridge is used. All activity commands, export and player calls throw; no spoofed success.
- Explicit label `DEMO · Yerel oyun/anket/tahta örneği` is carried in metadata and `data-game-fixture`. Production installation rejects before touching state. Root must dynamically import under DEV and preserve global visible fixture label.

## Shape coverage
S40: actual component catalog, empty/load/error/offline metadata. Current production catalog still lacks multi-room discoverable table projection, so reference default's two table rows cannot be certified by this fixture.
S41: waiting Holdem/Blackjack, seating/bot/full/owner/spectator and actual Cinema activity-conflict snapshot.
S42: standard/full/heads-up/not-turn/spectator public Holdem, responsive aliases preserve data and root capture uses inventoried viewport.
S43: raise/buy-in intent, all-in/raised/fold/check, public completed showdown/main/side/split pot projections. No unrevealed opponent cards in active play or folded historic hands.
S44: standard/pair/hit/bust/blackjack/double/stand/split/second and resolved split-family public states. Local visual examples follow public engine schema; they are not server-generated engine acceptance evidence. Native commands remain disabled. Exact per-variant card/stack/copy fidelity is awaiting root comparison; shared base states are not claimed pixel-identical.
S45/S48: fullpage create variant/folding/team/rules intents. Root must consume these in Games, rather than declaring a table created.
S46/S47: variant-specific real-schema bid/trump/bury/play/end projections, own hand only and public trick. Public bids are not mistaken for private hand contents.
S49/S50: own rack plus public meld/discard/indicator/count data; open/pairs/process/finish preview intents and completed score. Pure UI previews do not invoke commands. Other racks remain absent even in result/spectator projection. Inventory-specific tile/deck conservation and exact visual counts still need root verification; no engine-validation claim.
S51: current and archived history public results/statistics, kind detail intent, load/error/empty metadata. New additive historic seats/tableName/result fields are represented as explicitly DEMO local samples. Different-game scores/chips are not summed.
S52: ownRecovery takeover/pendingReturn/control-returned/turn-timeout example events with stable demo event IDs, hand and timestamps. Timeout sample specifically includes an example fold/toCall event; production cannot infer it from folded state. 30s takeover is not reclaim expiry.
S53: actual poll shape, creator/current capability, count/selection/changed/first/closed/nonowner/offline/create/close intents. Poll closure never starts a game.
S54: public stroke/text/rectangle shapes with authors, empty/read-only/reconnect/export/undo intent. No global cursor metadata or successful file export is synthesized.

## Current unsupported / pending entries
- S50/penalty: explicit throw. Recorded penalty-event capability is still internally missing.
- S54/saved: explicit throw. Named archive/title/save acknowledgment capability is internally missing; current room persistence is not archive success.
- All status variants require root private DEV initial activity integration. `activityState` supplied at installer boundary now matches root-added private state API; hook implementation/testing owned root.
- All modal/create/selection/undo/read-only variants require corresponding root/implementer initial component UI integration. Flag bypass must not precede integration. Exact keys are exposed in `pendingIntegration`, not silently replaced.
- Other supported projections remain NEEDS_RECHECK, not visual or functional certification. Renderer-safe sample data is authored locally; no node:crypto, game-service or shuffled engine imports enter the renderer.

The fixture contract is ready independently of UI intent integration. Source-owned Games intent integration and authoritative S51/S52 consumer update follow in the Games delivery report; Together/Whiteboard integration belongs to root.
