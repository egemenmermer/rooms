#!/usr/bin/env python3
"""Apply observed production compatibility fixes and pin pulled image digests."""
import json
import os
from pathlib import Path
import subprocess
import yaml

os.umask(0o077)
root = Path('/opt/rooms/config')
file = root / 'compose.yml'
compose = yaml.safe_load(file.read_text())
compose['services']['database']['image'] = 'mongo:7'
for name, uid in [('Revolt.toml',65532),('mongo-init.js',999),('private.json',999)]:
    os.chown(root / name,uid,uid)
    (root / name).chmod(0o600)
caddy = root / 'Caddyfile'
text = caddy.read_text()
line = 'tls /etc/letsencrypt/live/{$ROOMS_IP}/fullchain.pem /etc/letsencrypt/live/{$ROOMS_IP}/privkey.pem'
text = text.replace(line + ' {\n  default_sni {$ROOMS_IP}\n }',line)
if '\n default_sni' not in text:
    text = text.replace('auto_https off','auto_https off\n default_sni {$ROOMS_IP}')
caddy.write_text(text)
digests = {}
for name, service in compose['services'].items():
    image = service['image']
    metadata = json.loads(subprocess.check_output(['docker','image','inspect',image]))[0]
    digest = metadata['RepoDigests'][0]
    service['image'] = digest
    digests[name] = {'tag':image,'digest':digest,'id':metadata['Id']}
file.write_text(yaml.safe_dump(compose,sort_keys=False))
(root / 'IMAGE_DIGESTS.json').write_text(json.dumps(digests,indent=2) + '\n')
print('Container file permissions reconciled; images pinned to verified digests.')
