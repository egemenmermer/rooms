#!/usr/bin/env python3
"""Bootstrap owned accounts using official Stoat registration and onboarding.

Run only on the owned host. Credentials and sessions stay in a 0600 file.
The script checkpoints every completed step and can resume after an API failure.
"""
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import urllib.request
import urllib.error

os.umask(0o077)
root = Path('/opt/rooms/config')
private = root / 'bootstrap.json'
state = json.loads(private.read_text()) if private.exists() else {'accounts':{}}

def save():
    temporary = private.with_suffix('.tmp')
    temporary.write_text(json.dumps(state,indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(private)

def api(path, method='GET', body=None, token=None):
    headers = {'Content-Type':'application/json'}
    if token: headers['x-session-token'] = token
    request = urllib.request.Request('http://127.0.0.1:3022' + path,
        data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
    try:
        with urllib.request.urlopen(request,timeout=30) as response:
            data = response.read()
            return json.loads(data) if data else None
    except urllib.error.HTTPError as error:
        try: code = json.loads(error.read()).get('type','REQUEST_FAILED')
        except Exception: code = 'REQUEST_FAILED'
        raise RuntimeError(f'Official API {path}: HTTP {error.code} {code}') from None

def seed_invite(code):
    script = '''const p=JSON.parse(require('fs').readFileSync('/run/rooms/private.json','utf8'));
db.getSiblingDB('admin').auth('rooms_admin',p.mongo_root);
db.getSiblingDB('revolt').account_invites.updateOne({_id:CODE},{$setOnInsert:{used:false}},{upsert:true});'''.replace('CODE',json.dumps(code))
    result = subprocess.run(['docker','compose','exec','-T','database','mongosh','--quiet'],
        cwd=root,input=script,text=True,capture_output=True)
    if result.returncode: raise RuntimeError('Owned invitation provisioning failed; credentials withheld.')

for role,email,username in [('owner','egemenmermer@gmail.com','egemen'),
        ('guest','egemenmermerroomsqaguest@gmail.com','rooms_qa_guest'),
        ('outsider','egemenmermerroomsqaoutsider@gmail.com','rooms_qa_outsider')]:
    account = state['accounts'].setdefault(role,{'email':email,'username':username,
        'password':secrets.token_urlsafe(32),'invite':secrets.token_urlsafe(32)})
    save()
    if not account.get('created'):
        account['email'] = email
        save()
        seed_invite(account['invite'])
        api('/auth/account/create','POST',{'email':account['email'],'password':account['password'],'invite':account['invite']})
        account['created'] = True
        save()
    if not account.get('token'):
        session = api('/auth/session/login','POST',{'email':account['email'],'password':account['password'],'friendly_name':'ROOMS deployment bootstrap'})
        if not isinstance(session.get('token'),str): raise RuntimeError('Official account requires additional authentication.')
        account['token'] = session['token']
        save()
    if api('/onboard/hello',token=account['token'])['onboarding']:
        api('/onboard/complete','POST',{'username':account['username']},account['token'])
    account['userId'] = api('/users/@me',token=account['token'])['_id']
    save()
    print(f'Actual {role} account registered and onboarded.')

owner = state['accounts']['owner']['token']
if not state.get('spaceId'):
    created = api('/servers/create','POST',{'name':'ROOMS','description':'Our private evening clubhouse.'},owner)
    state['spaceId'] = created['server']['_id']
    state['textId'] = created['channels'][0]['_id']
    save()
if not state.get('voiceId'):
    channel = api('/servers/' + state['spaceId'] + '/channels','POST',
        {'type':'Text','name':'Lounge','description':'Voice, cinema and activities.','voice':{'max_users':8}},owner)
    state['voiceId'] = channel['_id']
    save()
if not state.get('communityCode'):
    invitation = api('/channels/' + state['textId'] + '/invites','POST',{},owner)
    state['communityCode'] = invitation.get('code',invitation.get('_id'))
    if not state['communityCode']: raise RuntimeError('Official invitation response has no identifier.')
    save()
guest = state['accounts']['guest']['token']
if not state.get('guestJoined'):
    api('/invites/' + state['communityCode'],'POST',{},guest)
    state['guestJoined'] = True
    save()
# Single-use tickets for the owner's friends, consumed only by the access broker.
if not state.get('tickets'):
    ledger_path = root / 'data/access/registration-invites.json'
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {'version':1,'invites':{}}
    state['tickets'] = []
    from datetime import datetime,timezone,timedelta
    for _ in range(6):
        code,account_code = secrets.token_urlsafe(32),secrets.token_urlsafe(32)
        seed_invite(account_code)
        expires = (datetime.now(timezone.utc)+timedelta(days=7)).isoformat().replace('+00:00','Z')
        digest = hashlib.sha256(code.encode()).hexdigest()
        ledger['invites'][digest] = {'accountInviteCode':account_code,'communityInviteCode':state['communityCode'],
            'createdAt':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'expiresAt':expires,'state':'available'}
        state['tickets'].append({'serverUrl':'https://62.238.119.134','inviteCode':code,'expiresAt':expires})
    ledger_path.write_text(json.dumps(ledger) + '\n')
    ledger_path.chmod(0o600)
    os.chown(ledger_path,1000,1000)
    save()
# Normalize the early Python checkpoint's UTC offset to the broker's RFC3339 Z schema.
ledger_path = root / 'data/access/registration-invites.json'
ledger = json.loads(ledger_path.read_text())
if any(item['createdAt'].endswith('+00:00') for item in ledger['invites'].values()):
    for item in ledger['invites'].values():
        item['createdAt'] = item['createdAt'].replace('+00:00','Z')
    ledger_path.write_text(json.dumps(ledger)+'\n')
    ledger_path.chmod(0o600)
    os.chown(ledger_path,1000,1000)
print('Owned community, voice-enabled channel and six expiring friend invitations are ready. Private delivery only.')
