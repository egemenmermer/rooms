# Existing Hetzner host assessment

Date: 2026-10-08. Scope: read-only assessment through the authenticated Hetzner web console. No installation, deletion, restart, firewall change, or credential change was performed by the agent.

## Observed capacity

Host: `ubuntu-4gb-hel1-1`, CX23, x86, Helsinki. Existing application: Hoppers.

Commands successfully executed and visually verified:

```text
free -h
RAM total 3.7 GiB; used 2.6 GiB; free 352 MiB;
shared 1.4 GiB; buff/cache 2.4 GiB; available 1.1 GiB.
Swap total 0 B.

df -h /
/dev/sda1: size 38 G; used 32 G; available 4.4 G; use 88%.

docker stats --no-stream
hoppers-website-1       5.348 MiB / 3.725 GiB
hoppers-api-1         107.6   MiB / 3.725 GiB
hoppers-caddy-1        29.67  MiB / 3.725 GiB
hoppers-console      186.4   MiB / 3.725 GiB
hoppers-engine-chromium 261.3 MiB / 1 GiB
hoppers-docs           12.78  MiB / 3.725 GiB
```

The Docker sample showed low CPU consumption (Chromium approximately 1.27%, others below 0.1%). This is a point-in-time sample, not a peak-load measurement. Container memory totals do not replace host available-memory accounting.

The console contained earlier memory-cgroup OOM events killing Chromium processes. These indicate historical container memory pressure, not proof of a current host-wide OOM. The Chromium container's observed limit is 1 GiB. The login banner requested a system restart and reported pending updates; neither was applied.

A prior key-only SSH attempt failed with `Permission denied (publickey)`. No persistent SSH access was added. An initial combined read command was corrupted by web-console keyboard mapping and only printed `free` usage; measurements above came from subsequent individual commands.

## Recommendation

Do not deploy the complete ROOMS core stack alongside Hoppers on this host in its current state. Only 4.4 G of root disk and 1.1 GiB of available RAM remain, leaving insufficient operational headroom for the additional services, images, databases, uploads, and logs.

Prefer a separate ROOMS core host. A dedicated 4 GB host can be evaluated for the small 3–6 person group through measured deployment and concurrent-user testing; 8 GB gives more headroom. These are planning estimates, not validated capacity guarantees. Preserve the previously approved separate Agent host.

Alternatively, assess a capacity upgrade of this existing host before co-hosting; resource limits and data isolation would still be needed. Do not remove existing application data or Docker resources merely to fit ROOMS.

Next deployment requires a chosen host, domain/TLS configuration, upstream Stoat deployment, Activity service, replaceable media transport, persistent storage and backups, followed by two-account and physical two-client verification. This assessment does not establish that any ROOMS production integration is deployed.

## Authorized maintenance — 2026-10-08, verified at 21:46 UTC

The user subsequently authorized host optimization. Terminal access succeeded using the existing `hoppers-prod` SSH configuration and its existing `hoppers` account with noninteractive sudo. The planned temporary root key was never installed; its unused local private/public files were removed. No existing access was removed or expanded. A failed web-console `tee` process from the key-entry attempt was terminated, leaving the console shell available.

Changes performed:

- `docker builder prune --all --force --filter until=48h --keep-storage 1GB`: reclaimed **1.681 GB** of unused build cache. Tagged rollback images, running containers, volumes, and application data were preserved. Subsequent builds may need to regenerate removed cache.
- `sudo apt-get clean`: removed downloaded package cache.
- Archived three inactive workspaces from RAM-backed `/tmp` and five inactive workspaces from `/var/tmp`. Each directory was checked independently with `lsof +D` before archival and again before removal. Docker bind mounts and systemd working directories were inspected. Archives were compared against their sources with `tar -dzf` before originals were removed. Application services were not restarted.
- Added `/swapfile-maintenance`, **1 GiB**, mode 0600, activated it and recorded it in `/etc/fstab`. Added `/etc/sysctl.d/90-rooms-maintenance.conf` with `vm.swappiness=10` (previous value 60). Ran `systemctl daemon-reload`; no reboot or service restart was performed. `findmnt --verify` reported zero parse errors and zero errors; its stale-systemd warning was addressed by the reload.

Protected archives (root-only parent directories):

```text
/var/backups/rooms-maintenance/20261008T214434Z/inactive-tmp-workspaces.tar.gz
143723908 bytes

/var/backups/rooms-maintenance/20261008T214540Z/inactive-var-tmp-workspaces.tar.gz
175326872 bytes

/var/backups/rooms-maintenance/20261008T214558Z/fstab.before
/var/backups/rooms-maintenance/20261008T214558Z/swappiness.before
```

Final observed state:

| Measurement | Before | After |
| --- | --- | --- |
| Root disk available | 4.4 G | 6.5 G |
| Root disk used | 88% | 82% |
| Available RAM | 1.1 GiB | 2.2 GiB |
| RAM-backed `/tmp` usage | 1.3 G | 103 M |
| Swap | none | 1 GiB; 4.1 MiB used |

All six original Docker containers remained running with restart counts of zero. Website and API healthchecks remained healthy. Docker, PostgreSQL, Hoppers Places console, and venue-engine projector systemd services were active. Local HTTP returned the expected HTTPS redirect (308); this is not an authenticated end-to-end application test. No new ROOMS services were installed.

Rollback: archives can be extracted as root to `/tmp` and `/var/tmp` respectively, after ensuring enough RAM/disk capacity and no path conflicts. Swap can be disabled with `swapoff /swapfile-maintenance` after checking RAM headroom; remove only its added fstab entry and maintenance sysctl file, restore the previous swappiness value, then reload systemd. The original fstab snapshot is preserved for comparison rather than blindly overwriting future changes.

The host now has substantially better headroom. Remaining disk capacity is still modest for an additional complete social/media stack, and this single sample does not establish peak-load capacity. Historical Chromium cgroup OOMs and the Chromium container's 1 GiB cap were not changed; swap does not guarantee prevention of container-limit OOMs. Capacity planning must use the post-maintenance measurements above rather than the original snapshot.
