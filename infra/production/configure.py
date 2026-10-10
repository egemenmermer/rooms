#!/usr/bin/env python3
"""Generate private deployment files once. Run on the owned core host, not a laptop.

Requires PyYAML and OpenSSL. Upstream application images are never modified.
Secrets are generated locally and are never printed or written to the repository.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import urllib.request
import yaml

os.umask(0o077)
root = Path('/opt/rooms')
config = root / 'config'
config.mkdir(parents=True, exist_ok=True, mode=0o700)
if (config / 'compose.yml').exists():
    sys.exit('Existing production configuration preserved.')
ip = sys.argv[1]
import ipaddress
ipaddress.ip_address(ip)
origin = 'https://' + ip
pin = '9af5e9063a8d1311477b7d2f24f5764ffe3e1cd1'
source = 'https://raw.githubusercontent.com/stoatchat/self-hosted/' + pin
upstream = urllib.request.urlopen(source + '/compose.yml', timeout=30).read()
compose = yaml.safe_load(upstream)
compose['name'] = 'rooms-core'
s = compose['services']
for name in ['voice-ingress', 'livekit', 'web']:
    del s[name]

def write(name, value):
    (config / name).write_text(value)
    (config / name).chmod(0o600)

values = {name: secrets.token_hex(32) for name in
          ['mongo_root', 'mongo_stoat', 'mongo_inviter', 'mongo_reader', 'rabbit', 'minio', 'postgres', 'livekit_secret']}
values['livekit_key'] = 'rooms-' + secrets.token_hex(12)
write('private.json', json.dumps(values))
write('.env', '')
# The upstream services use multiple logical databases. Their account has database
# read/write privileges, but cannot administer users; the broker can only insert invites.
write('mongo-init.js', '''const credentials = JSON.parse(require('fs').readFileSync('/run/rooms/private.json','utf8'));
const admin = db.getSiblingDB('admin');
admin.createUser({user:'rooms_stoat',pwd:credentials.mongo_stoat,roles:[{role:'readWriteAnyDatabase',db:'admin'}]});
const revolt = db.getSiblingDB('revolt');
revolt.createRole({role:'roomsInviteInsert',privileges:[{resource:{db:'revolt',collection:'account_invites'},actions:['insert']}],roles:[]});
revolt.createUser({user:'rooms_inviter',pwd:credentials.mongo_inviter,roles:['roomsInviteInsert']});
revolt.createRole({role:'roomsAuthRead',privileges:['channels','servers','server_members'].map(collection=>({resource:{db:'revolt',collection},actions:['find']})),roles:[]});
revolt.createUser({user:'rooms_reader',pwd:credentials.mongo_reader,roles:['roomsAuthRead']});
''')
s['database']['environment'] = {'MONGO_INITDB_ROOT_USERNAME': 'rooms_admin',
    'MONGO_INITDB_ROOT_PASSWORD': values['mongo_root']}
# MongoDB 8 cannot start on this Ubuntu kernel (SERVER-121912). Fresh deployment:
# use the supported 7.0 LTS line, then verify actual Stoat compatibility. No data downgrade.
s['database']['image'] = 'mongo:7'
s['database']['command'] = ['mongod', '--wiredTigerCacheSizeGB', '0.25']
s['database']['volumes'] += ['./mongo-init.js:/docker-entrypoint-initdb.d/rooms.js:ro', './private.json:/run/rooms/private.json:ro']
s['redis']['command'] = ['valkey-server', '--maxmemory', '128mb', '--maxmemory-policy', 'noeviction']
s['rabbit']['environment']['RABBITMQ_DEFAULT_PASS'] = values['rabbit']
s['minio']['environment']['MINIO_ROOT_USER'] = 'roomsuploads'
s['minio']['environment']['MINIO_ROOT_PASSWORD'] = values['minio']
s['createbuckets']['entrypoint'] = s['createbuckets']['entrypoint'].replace('minioautumn minioautumn', 'roomsuploads ' + values['minio'])
pair = subprocess.check_output(['openssl', 'ecparam', '-name', 'prime256v1', '-genkey', '-noout'])
pub = subprocess.check_output(['openssl', 'ec', '-pubout', '-outform', 'DER'], input=pair, stderr=subprocess.DEVNULL)
b64url = lambda b: base64.urlsafe_b64encode(b).decode().rstrip('=')
write('secrets.env', '\n'.join([
    'REVOLT__RABBIT__PASSWORD=' + values['rabbit'],
    'REVOLT__FILES__S3__ACCESS_KEY_ID=roomsuploads',
    'REVOLT__FILES__S3__SECRET_ACCESS_KEY=' + values['minio'],
    'REVOLT__FILES__ENCRYPTION_KEY=' + base64.b64encode(secrets.token_bytes(32)).decode(),
    'REVOLT__PUSHD__VAPID__PRIVATE_KEY=' + base64.b64encode(pair).decode().rstrip('='),
    'REVOLT__PUSHD__VAPID__PUBLIC_KEY=' + b64url(pub[-65:])]) + '\n')
write('Revolt.toml', f'''production = true
environment = "production"
[database]
mongodb = "mongodb://rooms_stoat:{values['mongo_stoat']}@database:27017/?authSource=admin"
[hosts]
app = "{origin}"
api = "{origin}/api"
events = "wss://{ip}/ws"
autumn = "{origin}/autumn"
january = "{origin}/january"
gifbox = "{origin}/gifbox"
[api.registration]
invite_only = true
''')
os.chown(config / 'Revolt.toml', 65532, 65532)
os.chown(config / 'mongo-init.js', 999, 999)
os.chown(config / 'private.json', 999, 999)
write('stoat.json', json.dumps({'api': origin + '/api'}) + '\n')
s['caddy']['env_file'] = 'ingress.env'
write('ingress.env', 'ROOMS_IP=' + ip + '\n')
s['caddy']['ports'] = ['80:80', '443:443']
s['caddy']['extra_hosts'] = ['host.docker.internal:host-gateway']
s['caddy']['volumes'] += ['/etc/letsencrypt:/etc/letsencrypt:ro', './data/acme:/srv/acme:ro']
s['caddy']['networks'] = ['default']
# Exact prefixes avoid exposing upstream account creation through ambiguous paths.
write('Caddyfile', '''{
 auto_https off
 default_sni {$ROOMS_IP}
 servers {
  protocols h1 h2
 }
}
http://{$ROOMS_IP} {
 handle /.well-known/acme-challenge/* {
  root * /srv/acme
  file_server
 }
 handle {
  redir https://{$ROOMS_IP}{uri} permanent
 }
}
https://{$ROOMS_IP} {
 tls /etc/letsencrypt/live/{$ROOMS_IP}/fullchain.pem /etc/letsencrypt/live/{$ROOMS_IP}/privkey.pem
 header -Server
 handle /.well-known/stoat {
  rewrite * /stoat.json
  root * /
  file_server
 }
 handle_path /rooms-access/* {
  reverse_proxy access:3002
 }
 handle_path /rooms-activities/* {
  reverse_proxy activities:3031
 }
 handle_path /api/* {
  @account_create path /auth/account/create /auth/account/create/*
  respond @account_create "Use a ROOMS signup invitation." 403
  reverse_proxy api:14702
 }
 handle /api {
  rewrite * /
  reverse_proxy api:14702
 }
 handle /ws {
  rewrite * /
  reverse_proxy events:14703
 }
 handle_path /autumn/* {
  reverse_proxy autumn:14704
 }
 handle_path /january/* {
  reverse_proxy january:14705
 }
 handle_path /gifbox/* {
  reverse_proxy gifbox:14706
 }
 handle_path /livekit/* {
  reverse_proxy host.docker.internal:7880
 }
 handle {
  respond "ROOMS private desktop community. Open the ROOMS application." 200
 }
}
''')
s['postgres'] = {'image':'postgres:17-alpine', 'environment':{
    'POSTGRES_USER':'rooms_activity','POSTGRES_PASSWORD':values['postgres'], 'POSTGRES_DB':'rooms'},
    'volumes':['./data/postgres:/var/lib/postgresql/data'], 'restart':'always',
    'healthcheck':{'test':['CMD-SHELL','pg_isready -U rooms_activity -d rooms'], 'interval':'10s','timeout':'5s','retries':10}}
common = {'SERVICE_HOST':'0.0.0.0','STOAT_INTERNAL_URL':'http://api:14702',
    'ROOMS_SOCIAL_READ_MONGO_URL':'mongodb://rooms_reader:' + values['mongo_reader'] + '@database:27017/revolt?authSource=revolt'}
s['access'] = {'image':'node:24-bookworm-slim','user':'1000:1000','working_dir':'/service',
    'command':['node','access.cjs'],'volumes':['../dist-services:/service:ro','./data/access:/state'],
    'environment':{**common,'LIVEKIT_INTERNAL_URL':'http://host.docker.internal:7880',
    'LIVEKIT_PUBLIC_URL':'wss://' + ip + '/livekit','LIVEKIT_API_KEY':values['livekit_key'],
    'LIVEKIT_API_SECRET':values['livekit_secret'],'ROOMS_REGISTRATION_INVITES_FILE':'/state/registration-invites.json',
    'ROOMS_ACCOUNT_INVITE_MONGO_URL':'mongodb://rooms_inviter:' + values['mongo_inviter'] + '@database:27017/revolt?authSource=revolt'},
    'extra_hosts':['host.docker.internal:host-gateway'],'restart':'always',
    'depends_on':{'api':{'condition':'service_started'}}}
s['activities'] = {'image':'node:24-bookworm-slim','user':'1000:1000','working_dir':'/service',
    'command':['node','activities.cjs'],'volumes':['../dist-services:/service:ro'],
    'environment':{**common,'ROOMS_ACTIVITY_DATABASE_URL':'postgresql://rooms_activity:' + values['postgres'] + '@postgres:5432/rooms'},
    'restart':'always','depends_on':{'postgres':{'condition':'service_healthy'},'api':{'condition':'service_started'}}}
s['media'] = {'image':'livekit/livekit-server:v1.9.12', 'network_mode':'host',
    'command':['--config','/etc/livekit.yaml'],'volumes':['./livekit.yaml:/etc/livekit.yaml:ro'], 'restart':'always'}
write('livekit.yaml', yaml.safe_dump({'port':7880,'bind_addresses':['0.0.0.0'],
    'rtc':{'tcp_port':7881,'port_range_start':50000,'port_range_end':50020,'use_external_ip':True,'node_ip':ip},
    'turn':{'enabled':True,'udp_port':3478},
    'keys':{values['livekit_key']:values['livekit_secret']},
    'webhook':{'api_key':values['livekit_key'],'urls':['http://127.0.0.1:3002/v1/media/webhook']}}))
# The SFU uses host networking; the signed callback is loopback-only.
s['access']['ports'] = ['127.0.0.1:3002:3002']
# Administrative API is loopback-only for owned bootstrap/testing.
s['api']['ports'] = ['127.0.0.1:3022:14702']
limits = {'database':'768m','redis':'192m','rabbit':'512m','minio':'384m','caddy':'128m',
          'api':'512m','events':'192m','autumn':'192m','january':'128m','gifbox':'64m',
          'crond':'128m','pushd':'128m','postgres':'256m','access':'192m','activities':'256m','media':'512m'}
for name, service in s.items():
    service['logging'] = {'driver':'json-file','options':{'max-size':'10m','max-file':'3'}}
    if name in limits:
        service['mem_limit'] = limits[name]
    if name in ['access','activities']:
        service['cap_drop'] = ['ALL']
        service['security_opt'] = ['no-new-privileges:true']
        service['read_only'] = True
        service['tmpfs'] = ['/tmp:size=16m']
write('compose.yml', yaml.safe_dump(compose, sort_keys=False))
access_dir = config / 'data/access'
access_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chown(access_dir,1000,1000)
(config / 'data/acme').mkdir(parents=True,exist_ok=True)
write('SOURCE_EVIDENCE.json', json.dumps({'upstreamCommit':pin,
    'composeSha256':hashlib.sha256(upstream).hexdigest(),'backendModified':False,
    'origin':origin,'secretsPrinted':False},indent=2) + '\n')
print('Production configuration generated. Secrets remain on the core host.')
