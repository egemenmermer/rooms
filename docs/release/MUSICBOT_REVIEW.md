# MusicBot review — 2026-10-13

Owner requested inspecting https://github.com/jagrosh/MusicBot for reusable fixes. Read official repository at859e5c5862decf433f8face5eaca3372d7d27b22, pom.xml, PlayerManager, AudioHandler, TransformativeAudioSourceManager, PlayCmd and FairQueue; read official troubleshooting page. No third-party application run, Discord account/token or production source migration.

The project is Java/JDA Discord plumbing with Lavaplayer2.2.1 and lavalink youtube-source/common1.5.2. PlayerManager registers provider adapters, including SoundCloud, and AudioHandler advances explicit queued requests when a track ends. Discord AudioSendHandler consumes encoded audio frames; this cannot simply replace ROOMS LiveKit PCM publisher. The repository's Apache2.0 license is documented; no Java code copied. Spotify resolution is not supplied by these inspected dependencies. README source support is not evidence a provider accepts our server/account/IP; upstream troubleshooting explicitly includes blocked source/IP cases.

Useful patterns: ordered per-room loads (already present in ROOMS serial command queue), advancing explicit queued requests after a failed item, distinguishing source failure from playback transport, and keeping source adapters isolated. Fair per-requester queue could be a later product option; it is not silently enabled and current FIFO stays intact. Do not copy unconstrained HTTP/local/transformation source access or unknown-title first-result fallback into the stricter ROOMS authorization/matching rules. Do not adopt IP rotation or challenge workarounds from troubleshooting.

Concrete ROOMS findings reproduced before fixing:
- A failed current item is retried on every newly added link, so a valid new explicit request never starts. Regression fails MUSIC_YOUTUBE_ACCESS_REQUIRED before correction.
- Retired decoder callback can mark the new track error because worker playback generations were reused. Regression fails expectedplaying/actualerror before correction.
- A failure arriving during source readiness is overwritten by a playing response. Regression fails expectederror/actualplaying before correction.

Corrections: explicit add after failure advances to the next queued request in FIFO, preserving the failed entry for inspection; no automatic replacement/search or denied-source retry. Every play gets a fresh worker generation; pause/end-of-queue retire callbacks; late failures and catches fence the current generation. Playing is applied after source readiness only if the same generation is stillconnecting. Existing current-error codes, stop behavior, privacy and bot lease authorization remain intact.26focusedmusicchecks/lint/type/servicesPASS. Real room audibility/position and Linux source transport receipts remain as recorded; fresh current-worker recovery transport is validated separately before deployment.

Sources:
- https://github.com/jagrosh/MusicBot/blob/859e5c5862decf433f8face5eaca3372d7d27b22/pom.xml
- https://github.com/jagrosh/MusicBot/blob/859e5c5862decf433f8face5eaca3372d7d27b22/src/main/java/com/jagrosh/jmusicbot/audio/PlayerManager.java
- https://github.com/jagrosh/MusicBot/blob/859e5c5862decf433f8face5eaca3372d7d27b22/src/main/java/com/jagrosh/jmusicbot/audio/AudioHandler.java
- https://github.com/jagrosh/MusicBot/blob/859e5c5862decf433f8face5eaca3372d7d27b22/src/main/java/com/jagrosh/jmusicbot/queue/FairQueue.java
- https://jmusicbot.com/troubleshooting/

Actual current Linux worker recoveryPASS: generated invalid MP3 causes real ffmpegMUSIC_DECODE_FAILED; explicit next YouTube request transitions current queue item and publishes real sourceaudio to separate SFU Node receiver375frames/RMS7585/position1.051s; stopdisconnectPASS. Controlled source-reference metadata and grant fixture are explicitlyDEMO, actualdecoder/provider/publisher/SFU/receiver. No real account/microphone/speakers. DJ_QUEUE_RECOVERY_RESULTS.json. Provider-denied links remain unavailable; queue repair does not grant source access.

Music-only operational update: bundlea846a8f1896ead8fecaa86e0ee77f8905ab119b936b0063a18e480db4de4ad75, derived image rooms-music:20261013-recovery, exact-runtime no-network/read-only startuphealth200 before music-only recreation, runninghealth200. Scoped encrypted rollback backup music-before-recovery-20261013.tar.age and priorcounterimage/compose preserved. No client release/install or account/Hoppers mutation. The update includes provider error fidelity and queue/generation corrections; source access denials remainOPEN.
