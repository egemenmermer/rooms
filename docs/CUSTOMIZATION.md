# Community customization

No real-person clip is bundled in the public client. The original default mascot is a static illustration and works without a network request.

A connected server may host /rooms-branding/manifest.json:
```json
{"version":1,"music":{"name":"My community DJ","poster":"/rooms-branding/dj.png","animation":"/rooms-branding/dj.webm"}}
```
Both media fields are optional. PNG/WebP/JPEG/AVIF posters and WebM/MP4 animations are accepted; all paths must remain under that community's /rooms-branding/ prefix. External hosts, credentials, traversal and query-bearing paths are rejected. Use HTTPS; loopback HTTP is allowed for isolated development.

Serve the manifest/assets from your selected community origin with CORS permitting the desktop app's origin (for public decorative assets, Access-Control-Allow-Origin:* is sufficient). These are public decorative resources: do not put private information or access tokens in them. Host only material you have the right to supply. This is operator configuration, not an arbitrary client upload facility.

Manifest responses are capped at8KiB, posters at4MiB and animations at12MiB, with timeouts, no redirects and no credentials/referrer. The client creates short-lived blob URLs, preserving the existing restrictive image/media CSP. A server change cancels old requests; unmount revokes URLs. Absent, invalid, offline or undecodable branding leaves the default static mascot. System reduced-motion preference disables custom animation.

For the voice participant's display name set ROOMS_MUSIC_NAME in the access service environment. Keep it consistent with the manifest. Music identities, leases, playback commands, queue and listener gain remain unchanged. Other server operators can choose their own brand independently.

Maintainer-only visuals are stored outside this source tree. Deploying a maintainer customization or changing a running service is a separate review step.

