# Owner manual checks — local 0.1.9

This copy revision is compiled and packaged, but not tested by the agent. Earlier evidence applies only to earlier revisions. The owner explicitly takes responsibility for manual testing; no automated checks should run without reauthorization.

Open `release/mac-arm64/ROOMS.app`. This is an unsigned Apple Silicon preview. Published 0.1.8 remains unchanged.

1. Sign in to the ROOMS server. Confirm Home and Spaces show only actual communities and rooms. Sign out and confirm the login form appears without fabricated content.
2. With a friend, send a message. Edit and delete it; check the friend sees each change.
3. Both join the same voice room. Enable the microphone, mute, deafen and switch screens. Check actual audio and that navigation preserves the call.
4. Open Cinema. It must start empty. Select your own video file and check play, pause, seeking and volume. This file plays on your device only.
5. In the same community room, add a YouTube video or create a poll. Check both users see changes.
6. Change compact mode, transparency and accent. Restart and check preferences persist.

Send the screen name, action and observed result for any failure. Separate Agent hosting/model accounts, authorized media-provider credentials, signing, Windows and physical-device acceptance remain pending. Do not treat compilation as completed product acceptance.

## 0.1.10 owner follow-up

Use the existing owner account's ROOMS password from the privately delivered file, rather than registering the same email again. The failed signup ticket cannot be reused. This is not the root or Gmail password.

Open Settings from each screen. Confirm main navigation is hidden, settings content fills the window, X and Escape return to the preceding screen, category switching works, and a joined voice call continues while Settings is open. No automatic acceptance has been performed for this revision.

## 0.1.11 popup follow-up

Open Settings while a conversation or video is open. Confirm the previous screen remains behind a dark scrim, the sheet fills most of the window with a small margin, the background cannot be clicked, categories/content scroll normally, and X/Escape/scrim click returns to the same position. Open a nested provider/settings dialog and confirm Escape closes only that dialog first. Check ongoing voice/video yourself. This revision is not agent-tested.

## 0.1.12 voice rooms and photos

1. Profile → Photo: select a PNG/JPEG/WebP under 2 MB. Confirm it appears in the room and channel roster; an account without a photo should show initials.
2. Join one voice channel with a friend. Speak while unmuted, then mute. Confirm real green speaking outlines in both clients, without a false outline when muted.
3. Enable camera; select a screen/window, then stop sharing. Confirm received video and stop behavior with the friend.
4. Click a participant, adjust personal volume and open a DM. Check microphone/deafen/leave controls and Settings overlay.
5. Switch channels and navigate between chat/Activities. Check the actual participant lists, connection state and persistent audio.

The owner performs these checks. No new automatic verification has run.

## Local 0.1.13 — channel menus, microphone filtering and Soundboard

Implemented, compiled and packaged only; no agent tests or type checks. Owner checks:

1. Sign in. Right-click a channel or the TEXT/VOICE section heading (or use its +). Create a text channel and a voice room. Confirm a friend's channel list updates. Rename each; renaming a connected room should preserve the call.
2. Delete only a disposable channel: cancel first, then confirm. Check the friend sees removal. Deleting your joined voice room should leave that call; deleting another channel should preserve it. An account without ManageChannel permission must receive the upstream permission error. Shift+F10/Context Menu opens the menu; arrows and Escape control it.
3. Settings → Voice → noise reduction: switch it with the microphone active, and reconnect with it disabled. Compare with a friend. This uses Chromium/WebRTC noise suppression, not a Krisp-quality guarantee; hardware/OS support varies.
4. In voice, open the musical-note Soundboard button. Add your own audio file (maximum 8 seconds, 2 MB; 8 clips per session). Unmute, play and ask the friend whether it arrives. Use Stop, mute, deafen and leave during playback: transmission must stop. A subsequent play replaces the prior clip. Volume affects the clip, not the microphone. With push-to-talk, hold its shortcut on a Soundboard control while playing; key release must stop the clip.
5. Sign out/restart: selected clips should be gone. They are memory-only, not uploaded to the server. No sample sounds are bundled. The sender does not locally monitor their own transmitted clip.

No remote service modification, physical-device or Windows validation is claimed. Report the action and observed result.
