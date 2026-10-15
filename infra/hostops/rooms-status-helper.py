#!/usr/bin/python3 -I
"""Read only configured container health; never return inspect env/mounts/logs."""
import json
import os
import re
import stat
import subprocess
import sys

CONFIG = '/etc/rooms-hostops/status.json'

def snapshot():
    descriptor = os.open(CONFIG, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor) as stream:
        info = os.fstat(stream.fileno())
        if info.st_uid != 0 or info.st_mode & 0o022 or not stat.S_ISREG(info.st_mode):
            raise ValueError('untrusted status configuration')
        config = json.load(stream)
    services = []
    for item in config.get('containers', [])[:100]:
        name = item['name']
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,100}', name):
            raise ValueError('invalid container')
        state, restarts = 'unknown', None
        try:
            result = subprocess.run(['/usr/bin/docker', 'inspect', '--type', 'container',
                '--format', '{{json .State}}|{{.RestartCount}}', name],
                env={'PATH':'/usr/bin:/bin'}, timeout=2, capture_output=True, check=True)
            value, count = result.stdout.decode().strip().rsplit('|', 1)
            value = json.loads(value)
            restarts = int(count)
            health = value.get('Health', {}).get('Status')
            state = ('unhealthy' if not value.get('Running') or health == 'unhealthy'
                     else 'healthy' if health == 'healthy' else 'unknown')
        except Exception:
            pass
        services.append({'name': str(item['label'])[:100], 'state':state, 'restarts':restarts})
    # The backup job updates this root-owned receipt only after verification succeeds.
    last_backup = None
    receipt = config.get('backupReceipt')
    if receipt:
        try:
            descriptor = os.open(receipt, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(descriptor) as stream:
                info = os.fstat(stream.fileno())
                if info.st_uid != 0 or info.st_mode & 0o022:
                    raise ValueError('untrusted receipt')
                value = json.load(stream)
                if value.get('verified') is True and isinstance(value.get('completedAt'), int):
                    last_backup = value['completedAt']
        except Exception:
            pass
    return {'services':services, 'lastBackupAt':last_backup, 'workloads':[]}

if __name__ == '__main__':
    try:
        if os.geteuid() != 0 or sys.argv[1:] != ['snapshot']:
            raise ValueError('invalid invocation')
        print(json.dumps(snapshot()))
    except Exception:
        print('Status measurement unavailable.', file=sys.stderr)
        sys.exit(1)
