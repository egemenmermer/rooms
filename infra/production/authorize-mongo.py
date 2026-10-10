#!/usr/bin/env python3
"""Provision a find-only role for live authorization; preserve existing upstream data."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import yaml

os.umask(0o077)
root=Path('/opt/rooms/config')
private=root / 'private.json'
values=json.loads(private.read_text())
if 'mongo_reader' not in values:
    values['mongo_reader']=secrets.token_hex(32)
    private.write_text(json.dumps(values))
script='''const p=JSON.parse(require('fs').readFileSync('/run/rooms/private.json','utf8'));
db.getSiblingDB('admin').auth('rooms_admin',p.mongo_root);
const social=db.getSiblingDB('revolt');
if(!social.getRole('roomsAuthRead')) social.createRole({role:'roomsAuthRead',privileges:['channels','servers','server_members'].map(collection=>({resource:{db:'revolt',collection},actions:['find']})),roles:[]});
if(!social.getUser('rooms_reader')) social.createUser({user:'rooms_reader',pwd:p.mongo_reader,roles:['roomsAuthRead']});
'''
result=subprocess.run(['docker','compose','exec','-T','database','mongosh','--quiet'],cwd=root,input=script,text=True,capture_output=True)
if result.returncode: raise RuntimeError('Read-only authorization role provisioning failed. Secrets withheld.')
file=root / 'compose.yml'
compose=yaml.safe_load(file.read_text())
for name in ['access','activities']:
    compose['services'][name]['environment']['ROOMS_SOCIAL_READ_MONGO_URL']='mongodb://rooms_reader:' + values['mongo_reader'] + '@database:27017/revolt?authSource=revolt'
file.write_text(yaml.safe_dump(compose,sort_keys=False))
print('Find-only authorization adapter configured; no access to accounts, sessions or writes.')
