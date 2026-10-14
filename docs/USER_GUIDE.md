# Using ROOMS

[← README](../README.md) · [Self-hosting](SELF_HOSTING.md) · [Troubleshooting](TROUBLESHOOTING.md)

## Contents

- [Before you start](#before-you-start)
- [Join a community](#join-a-community)
- [Find your way around](#find-your-way-around)
- [Chat and people](#chat-and-people)
- [Voice and screen sharing](#voice-and-screen-sharing)
- [Shared activities and music](#shared-activities-and-music)
- [Settings and updates](#settings-and-updates)
- [Privacy and getting help](#privacy-and-getting-help)

## Before you start

Ask the person running your community for:

1. A compatible ROOMS installer, or instructions to build the client.
2. The community's server address, usually an HTTPS URL.
3. An invitation for a new account, or confirmation that your existing account is on that server.

There is no universal ROOMS account. Signing into a different community server does not automatically move your account, messages, or permissions there. GitHub login is not a ROOMS account.

There are currently no maintained public installer assets in this repository. Do not download executables from issue comments or assume that a source archive is an installer. Operators building their own distribution should follow [releasing](RELEASING.md).

## Join a community

1. Install and open the desktop app supplied by your operator, or [run it from source](DEVELOPMENT.md).
2. Open the operator's invitation link, or enter the community server address in onboarding. Supported app invitation links use the `rooms:` scheme; whether the OS can open them depends on an installed, registered desktop build.
3. If you already have an account on that server, sign in. Otherwise, use the operator-issued signup invitation and complete registration. An upstream Stoat invitation and a ROOMS signup ticket are different; ask your operator for the ROOMS invitation.
4. Follow the profile and device setup shown by the app. Grant microphone/camera/screen access only when using those features.
5. Select an available community/channel. What you can see and do depends on your membership and role.

If an invitation is expired, already used, or registration stops partway through, ask the operator to inspect it and issue an appropriate replacement. Repeated retries cannot safely repair a partially created account.

A source build starts without a default server. This is expected: enter your operator's address. An empty server field is not a missing public service.

## Find your way around

![Community home](images/home.png)

- **Home:** the community overview and entry points to conversations and activities.
- **Channels and conversations:** select the text or voice space you want to use.
- **People and relationships:** available community members and supported friend/DM actions.
- **Activities:** shared tools and games where the operator has enabled the required service.
- **Settings:** account connections, device preferences, appearance, and desktop behavior.

The screenshots use sample community data. Some interface labels are currently Turkish; their position and wording can change between builds.

## Chat and people

![Chat](images/chat.png)

Select a text channel, write your message, and send it. The selected server owns the message history. Editing, deleting, reactions, attachments, and member actions depend on the server response and your permissions.

Attachments are selected through the native file picker. The current upload boundary accepts supported document/media types, requires a nonempty file, and limits files to 25 MiB. The server may impose additional restrictions. Do not interpret an upload error as a successful send.

Profiles, friends, and direct messages use the selected backend's identities. If a user is missing or an action is denied, confirm the community, account, and role with your operator.

## Voice and screen sharing

![Voice room](images/voice.png)

1. Select a voice-enabled channel you are allowed to join.
2. Wait for the app to report a connected session.
3. Choose your microphone and output device. Enable your microphone explicitly; connecting does not automatically grant OS capture permissions.
4. Use mute when you do not want to transmit. Deafen silences incoming audio and also mutes your microphone. Undeafening does not automatically unmute it.
5. Enable the camera only when you want to send video.
6. To share, use the screen-share control and choose the screen/window in the native picker. Stop sharing when finished.
7. Leave the voice room when you want to end the session. Navigating to another page is designed to keep the active voice session alive.

On macOS, check the app's microphone, camera, and screen-recording permissions in System Settings. Permission changes may require reopening the app. Windows device/privacy settings also apply. System audio support depends on the platform and packaged build; sharing a picture does not guarantee that sound is being captured.

No sound or a call that never connects? See [media troubleshooting](TROUBLESHOOTING.md#voice-connects-but-audio-or-sharing-fails).

## Shared activities and music

Activities and games require the operator's Activities service. An unavailable service or missing permission may leave an activity unavailable even though the page exists.

The community DJ requires a separately configured music worker and supported source access. The queue belongs to the room/service; closing the DJ panel is not intended to cancel it. Your participant volume is your own listening preference.

Personal media connections use your own authorized provider access. A provider can reject content even if it plays in another program. Do not share credentials or personal stream URLs in public reports.

The optional Agent requires an independently provisioned host and explicit account/resource grants. It is not needed to use ordinary chat or voice.

## Settings and updates

Use Settings for devices, appearance, personal connections, and desktop preferences. Account passwords and credentials belong to your chosen server/provider, not this GitHub repository.

In-app updates work only when your distributor has configured a compatible update feed and released correctly signed packages. A locally compiled app does not automatically receive the operator's updates. If updates are unavailable, ask the distributor which build/feed you should use; do not replace signing keys or bypass a signature failure.

The default music illustration can differ by community. Operators can [configure their own artwork](CUSTOMIZATION.md) without asking each member to edit source files.

## Privacy and getting help

Treat the server operator as the administrator of your community's stored data. Encrypted network transport is not the same as end-to-end encryption; E2EE is not configured here. Ask the operator about retention, backups, account recovery, export, and deletion.

For a problem, record the app version, OS, the action you took, and the visible error. Share a screenshot only after removing private messages, account addresses, invitations, and provider details. Community/account problems go to your operator; reproducible source bugs can be reported in the repository. Security reports follow [SECURITY.md](../SECURITY.md).
