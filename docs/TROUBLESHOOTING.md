# Troubleshooting and FAQ

[← README](../README.md) · [User guide](USER_GUIDE.md) · [Self-hosting](SELF_HOSTING.md)

## Contents

- [Where is the download?](#where-is-the-download)
- [Does everyone need to self-host?](#does-everyone-need-to-self-host)
- [The app opens but does not connect](#the-app-opens-but-does-not-connect)
- [An invitation does not work](#an-invitation-does-not-work)
- [Voice connects but audio or sharing fails](#voice-connects-but-audio-or-sharing-fails)
- [Activities or music are unavailable](#activities-or-music-are-unavailable)
- [Updates are unavailable](#updates-are-unavailable)
- [Build and setup problems](#build-and-setup-problems)
- [Reporting a useful bug](#reporting-a-useful-bug)

## Where is the download?

The public repository currently distributes source, without maintained public installer assets. Ask your community operator for a compatible installer or follow [development](DEVELOPMENT.md) to build it. Source tags are not application downloads.

## Does everyone need to self-host?

No. One operator runs a community backend. Other members install the desktop client and join that server. Different servers have separate accounts and data; there is no built-in global account service or maintainer server default.

## The app opens but does not connect

**Member:** check the selected server address, internet connection, and account. Ask the operator whether the backend is running. Starting `pnpm dev` starts the desktop client, not a server stack.

**Operator:** verify the public API and websocket URL advertised by Stoat, reverse-proxy routes, TLS certificate, and access-service availability. A successful `/health` response from one service is not proof that accounts, permissions, or media work end to end. Loopback URLs refer to the member's own computer and are unsuitable as a remote server address.

If Docker setup fails, check that the Docker engine is actually running and that Compose configuration validates. Do not restart unrelated containers or erase volumes as a first response.

## An invitation does not work

Check that it is for the selected server and has not expired or been used. A ROOMS single-use signup ticket differs from an upstream community invitation.

A failed or interrupted signup can leave a ticket in `claiming` or `failed`. The operator must check upstream account creation before replacing the ticket or recovering a stale lock. Do not reset it blindly to `available`; an account may already exist.

Password recovery depends on the upstream deployment and its mail/recovery configuration. The app cannot recover an account by itself when that service is not configured.

## Voice connects but audio or sharing fails

**Member checks:**

1. Confirm microphone/output device selection and OS privacy permissions.
2. Check mute/deafen and your local participant volume.
3. Reopen the app after changing OS capture permissions if required.
4. Try a second device/headset and ask another member whether they receive your track.
5. For screen sharing, choose an actual source. System audio has separate platform/build constraints.

**Operator checks:**

1. Ensure the public LiveKit URL is reachable from outside the server and uses WSS for remote clients.
2. Ensure LiveKit and the access service use the same API key/secret.
3. Confirm ViewChannel/Connect and publishing permissions for the actual member/channel.
4. Verify TCP/UDP media reachability, public-IP advertisement, and your NAT/TURN design where applicable.
5. Check the signed LiveKit webhook reaches `/v1/media/webhook` on the access service.
6. Test with two physical devices on different networks, including leave/rejoin and permission revocation.

Server CPU/RAM alone do not prove adequate media capacity. Screen-share bitrate, number of viewers, network egress, packet loss, and round-trip latency matter. No fixed server size or participant limit is certified by this source repository.

## Activities or music are unavailable

Activities need their own service and durable storage. An authorization failure may be a membership/role problem, not a database problem. The public proxy must forward the Activities prefix to the correct service.

Music needs a running worker, a matching independent service secret, and an approved source configuration. Java/native provider components have extra prerequisites; see the linked music documentation in [self-hosting](SELF_HOSTING.md#optional-services). Playback in VLC does not establish compatibility with this app's playback path.

Optional services can be left disabled. They are not prerequisites for ordinary social chat, and the Agent is not required for voice.

## Updates are unavailable

A distributor must configure a feed and publish compatible trusted packages. A source build has no automatic enrollment in a maintainer feed. Ask your distributor for the correct version. Signature failures require investigation; do not bypass them or replace a verification key casually.

## Build and setup problems

- **Wrong Node/pnpm:** use the versions pinned in `package.json` and the [development guide](DEVELOPMENT.md).
- **Lockfile failure:** preserve the frozen-lockfile error; do not solve it by deleting the lockfile. First check your toolchain and registry access.
- **Native build error on Mac:** check Xcode Command Line Tools and the supported architecture. Packaging/signing have additional prerequisites.
- **Port in use:** stop your own development process or choose an isolated environment. Do not terminate an unknown service.
- **Missing `infra/local` files:** historical local verification helpers expect generated private configuration. They are not an automatic production installer. Use the explicit setup instructions in [self-hosting](SELF_HOSTING.md).
- **No database migration command:** Activities initializes its current PostgreSQL table on startup; that does not provide a general upgrade/downgrade migration system. Review storage compatibility before switching versions.

## Reporting a useful bug

Include the source commit or app version, OS/architecture, expected behavior, actual behavior, and minimal steps. State whether you used a real server or a local fixture. For media, include which side sent/received and whether you tested across networks.

Never attach passwords, tokens, private invitation links, provider URLs with credentials, session files, or an unredacted database. Use [SECURITY.md](../SECURITY.md) for security-sensitive reports.
