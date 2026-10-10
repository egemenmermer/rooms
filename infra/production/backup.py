#!/usr/bin/env python3
"""Quiesce authoritative writers, take database dumps, encrypt, and resume services.

Requires the owner's public SSH key as an age recipient in backup-recipient.txt.
No backup key is stored on the core host. Temporary plaintext is root-only.
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from datetime import datetime,timezone

os.umask(0o077)
root=Path('/opt/rooms/config')
compose=['docker','compose','-f',str(root/'compose.yml')]
writers=['access','activities','api','events','autumn','crond','pushd']
recipient=(root/'backup-recipient.txt').read_text().strip()
if not recipient.startswith('ssh-ed25519 '): raise RuntimeError('Owned backup recipient is missing.')
stage=Path(tempfile.mkdtemp(prefix='rooms-backup-',dir='/opt/rooms'))
started=False
try:
    started=True
    subprocess.run(compose+['stop']+writers,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    # Tool configuration avoids credentials in shell command arguments or log output.
    prepare="const p=JSON.parse(require('fs').readFileSync('/run/rooms/private.json','utf8'));require('fs').writeFileSync('/tmp/rooms-dump.yml','password: '+p.mongo_root+'\\n',{mode:0o600});"
    subprocess.run(compose+['exec','-T','database','mongosh','--quiet'],input=prepare,text=True,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    with (stage/'mongo.archive.gz').open('wb') as output:
        subprocess.run(compose+['exec','-T','database','mongodump','--config=/tmp/rooms-dump.yml','--username=rooms_admin','--authenticationDatabase=admin','--archive','--gzip'],stdout=output,stderr=subprocess.DEVNULL,check=True)
    with (stage/'activity.sql').open('wb') as output:
        subprocess.run(compose+['exec','-T','postgres','pg_dump','-U','rooms_activity','rooms'],stdout=output,stderr=subprocess.DEVNULL,check=True)
    shutil.copytree(root,stage/'config',ignore=shutil.ignore_patterns('data'))
    shutil.copytree(root/'data/minio',stage/'uploads')
    shutil.copytree('/etc/letsencrypt',stage/'letsencrypt',symlinks=True)
    shutil.copytree('/opt/rooms/dist-services',stage/'dist-services')
    archive=stage/'rooms.tar'
    subprocess.run(['tar','-cf',str(archive),'-C',str(stage),'config','uploads','letsencrypt','dist-services','mongo.archive.gz','activity.sql'],check=True)
    output=Path('/opt/rooms/backups')/('rooms-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.tar.age')
    subprocess.run(['age','-r',recipient,'-o',str(output),str(archive)],check=True,stderr=subprocess.DEVNULL)
    print('Encrypted backup completed: '+str(output))
finally:
    subprocess.run(compose+['exec','-T','database','rm','-f','/tmp/rooms-dump.yml'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if started:
        subprocess.run(compose+['start']+writers,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    shutil.rmtree(stage)
