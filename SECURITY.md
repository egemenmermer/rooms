# Security policy

This project is under active development. Report suspected vulnerabilities privately to the repository maintainer through GitHub private vulnerability reporting when enabled, or request a private contact channel without posting sensitive details.

Before opening the public repository, the maintainer must enable and verify a working private reporting route. Do not post credentials, private user content or exploit details in public issues. Include affected version/commit, impact, minimal safe reproduction and an appropriate contact route in the private report.

Only test systems/accounts you are authorized to use. Production disruption/load tests require separate authorization. Never use another operator's signing, deployment or provider credentials.

The renderer is sandboxed; privileged operations remain in Electron main or a server authority. Keep IPC sender validation, strict schema checks, current membership checks, native encrypted credential storage and lifecycle cleanup intact. Source review is not a guarantee that all platform/provider journeys have been accepted.

No end-to-end encryption against the server operator is claimed. Self-hosters are responsible for TLS, firewalling, protected backups, access control, retention and their community's privacy disclosures.

