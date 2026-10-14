# Public package boundary

Packaging defaults to `ROOMS_DISTRIBUTION_SCOPE=public`. The Electron after-pack hook inspects the actual application ASAR and unpacked resource files on macOS and Windows before signing. It refuses private artwork, account/session/history exports, signing keys, embedded infrastructure IP URLs, personal filesystem paths and credential values in data/config files. Failure reports paths, never file contents or credential values.

Operators can add literal hostname/address/account markers through an external JSON string-array file named by `ROOMS_PRIVATE_PUBLICATION_MARKERS_FILE`. Keep that file outside source and packaging inputs. The source policy uses the same private external markers; do not put real infrastructure addresses into a public deny list.

Only explicitly selected `ROOMS_DISTRIBUTION_SCOPE=community` packages may contain a private community update configuration. Such packages belong in the operator's private distribution and archives, not this repository's public releases. A public package may use its own deliberately public HTTPS update domain and public verification key. The Apple signing certificate identifies its publisher; it is not a secret and cannot be hidden while retaining trusted signing.

This scan is a gate, not proof of every possible secret or private value. Inspect final installer resources, updater configuration, manifests, screenshots, archive members and the intended GitHub upload inventory before publication. An application-ASAR check does not certify a complete DMG/ZIP/EXE, platform signing or physical-device functionality.

Historical GitHub releases and CI artifacts are separate from future package checks. Old PR refs and cached commit/file views require an independent disposition; changing current source cannot purge them. Never claim retained views were removed merely because editable history and current package checks pass.
