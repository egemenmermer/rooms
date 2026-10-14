# Post-RC7 media reports — 2026-10-13

- Owner reports soundboard partly broken; exact failing action and observer remain pending. Do not mark fixed.
- Owner reports personal IPTV channels loaded and initially played, then failed. Owner clarifies it was visible through screen sharing. Owner subsequently confirms the IPTV player showed an error; screen/app termination is not reported. Exact error text remains pending. Do not attribute the failure without evidence.
- Confirmed source defect: Xtream stream category IDs are rendered directly instead of resolving live category names. Fetch bounded category metadata privately; preserve channel availability when optional metadata fails and preserve account/connection fences.
- No new release or install authorized for this investigation. RC7 artifacts remain immutable.

## Category correction

Implemented bounded private `get_live_categories` lookup and ID-to-name mapping. Optional category failure preserves channels with an explicit group label. Existing account/connection checks fence the additional request.

Validation: provider-channel-history suite 12/12 PASS; TypeScript PASS; scoped ESLint PASS; diff whitespace PASS. No real provider credentials used. Owner real-provider/manual acceptance pending. No release or installation performed.

## Live player recovery

Added bounded recovery only after actual live playback: two delayed retries for transient fatal network errors; one recovery for an actual native decode error, with a 10-second deadline. No automatic retry for 401/403/410/404, unsupported initial sources or paused streams without a decode error. Cleanup cancels pending retry/deadline on source replacement, manual retry, stop or account change. Native decode events and fatal HLS events share one recovery budget.

Validation: scoped provider/history and player lifecycle suites 22/22 PASS; scoped ESLint PASS. Real owner source failure is not reproduced and remains OPEN, not fixed-by-assumption. Soundboard exact symptom still pending. Implementation follows hls.js recovery guidance: https://github.com/video-dev/hls.js/blob/master/docs/API.md
