# Deployment and operations
## Deployment shape
The production core is a dedicated Hetzner Linux host. It is distinct from the pre-existing Hoppers host and the planned separate Agent host. The active core exposes a trusted HTTPS IP origin and explicit proxy prefixes.
Caddy fronts the unmodified Stoat API/events/uploads/media helpers, ROOMS access/Activities, independent LiveKit and signed-update artifacts. MongoDB, PostgreSQL, message/cache infrastructure and object storage are backend dependencies, not browser data stores.
The music worker is separately configured and reaches media/access endpoints through the deployment’s approved internal topology. Optional Agent execution must remain on its separate host.

## Configuration ownership
Production configuration is generated privately; deployment scripts preserve existing installation state. Upstream images remain unmodified and production image digests should be recorded.
Do not rerun fresh bootstrap/registration scripts against existing state casually. Environment files, datastores, key material and model/provider sessions must remain private.
The generic checked-in setup does not automatically incorporate every later live configuration edit. Publish a compatible source/service/image/config manifest and use it during restore/release.

## Lifecycle
Identify service and release scope first. Inspect sanitized health/status and current version/digests. Back up before a stateful change; retain prior artifacts/configuration.
Replace only intended service bundles and explicitly reload/restart the relevant owned process when needed. Replacing a file bind mount via rename can leave a running container on the old inode: source bytes on disk do not prove live code/credential identity.
Do not restart/reconfigure an unrelated host or every service as a routine repair.

## Certificates and routing
Trusted short-lived IP certificates have a renewal timer and Caddy reload path. Monitor real renewal/failure rather than assuming a past simulation closes ongoing operation.
Routing preserves private raw account creation, upstream prefixes, independent media and updates. Documentation lives under /docs/ in a restricted static artifact root. Adding docs must not turn the core configuration root into a public file server.
Validate config before graceful reload, retain rollback bytes and confirm existing route health afterwards.

## Backup / restore
A daily backup quiesces authoritative writers, collects database/object/config/service/certificate state, encrypts the archive and resumes writers. Retention and off-host copying must be observed operationally.
Measure the maintenance interruption. Recovery needs isolated database restore plus readable object bytes/metadata/encryption context, not only archive integrity.
Record recovery point/time and compatible previous application/service schema. Keep decryption control off-host and clear plaintext staging. Optional Agent encryption/state recovery is independent.
A scheduled job should alert on failure, stalled resume, low disk and inaccessible encrypted copy.

## Incident sequence
1. Identify exact desktop/server version, user action and bounded error category.
2. Distinguish user device permission, provider/account, auth/membership, backend/DB, realtime network and UI failures.
3. Verify relevant dependency/status without leaking logs or triggering unrelated mutations.
4. Preserve evidence and determine whether acknowledged data or externally applied operations are uncertain.
5. Apply a narrowly scoped reversible change after backup/provenance check.
6. Confirm the original user journey and negative permission/recovery edges.
7. Update issue/current-state/operation records with actual evidence.
Health200 alone does not certify chat, audible voice, permission revocation, source decoding or external Agent operation.

## Current verification boundary
At the audit, anonymous access/Activity health and the signed-update feed answered trusted HTTPS. Installed Mac trust/stapling was verified. Historical isolated core backups/restores and scheduled off-host copies exist.
Newest physical two-Mac media, six-distinct-user sustained capacity, actual old-to-new update and current existing-data upgrade remain separate release acceptance.
This site is explanatory. Restricted private operator runbooks and detailed audit findings are maintained in the GitHub repository rather than published as server credentials/inventory dumps.
