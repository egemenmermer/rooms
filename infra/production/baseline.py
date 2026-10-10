#!/usr/bin/env python3
"""Apply an idempotent owned-host baseline without restarting working services."""
from pathlib import Path
import subprocess
import os

os.umask(0o077)
swap = Path('/rooms.swap')
if not swap.exists():
    subprocess.run(['fallocate','-l','1G',str(swap)],check=True)
    swap.chmod(0o600)
    subprocess.run(['mkswap',str(swap)],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['swapon',str(swap)],check=True)
fstab = Path('/etc/fstab')
if '/rooms.swap' not in fstab.read_text():
    with fstab.open('a') as stream:
        stream.write('\n/rooms.swap none swap sw 0 0\n')
Path('/etc/sysctl.d/90-rooms-memory.conf').write_text('vm.swappiness=10\n')
subprocess.run(['sysctl','-p','/etc/sysctl.d/90-rooms-memory.conf'],check=True)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','rooms-renew.timer'],check=True)
# Root access remains available during deployment; this account is for owned maintenance.
if subprocess.run(['id','rooms-deploy'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
    subprocess.run(['useradd','--create-home','--shell','/bin/bash','rooms-deploy'],check=True)
print('Memory headroom and certificate renewal timer configured.')
