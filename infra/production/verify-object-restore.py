#!/usr/bin/python3
"""Read a known owned QA object from an isolated restored MinIO, never production."""
from pathlib import Path
import json,os,secrets,subprocess,time,shutil,base64
from datetime import datetime,timezone
root=Path('/opt/rooms/restore-check');name='rooms-restore-objects'
def run(args,**kwargs):return subprocess.run(args,check=True,capture_output=True,**kwargs)
if subprocess.run(['docker','inspect',name],capture_output=True).returncode==0:raise RuntimeError('Owned restore container already exists; inspect first')
os.umask(0o077)
private=root/'object-check-private';private.mkdir(mode=0o700)
password=secrets.token_hex(24)
env=private/'env';env.write_text('MINIO_ROOT_USER=roomsrestore\nMINIO_ROOT_PASSWORD='+password+'\n')
config=private/'config.json';config.write_text(json.dumps({'version':'10','aliases':{'restore':{'url':'http://127.0.0.1:9000','accessKey':'roomsrestore','secretKey':password,'api':'S3v4','path':'auto'}}}))
expected=(root/'object-expected.txt').read_bytes()
image=run(['docker','inspect','rooms-core-minio-1','--format','{{.Config.Image}}']).stdout.decode().strip()
mc=run(['docker','inspect','rooms-core-createbuckets-1','--format','{{.Config.Image}}']).stdout.decode().strip()
client=['docker','run','--rm','--network','container:'+name,'--user','0:0','--memory','128m','--cap-drop','ALL','--security-opt','no-new-privileges','--mount','type=bind,src='+str(private)+',dst=/root/.mc',mc]
try:
 run(['docker','run','-d','--name',name,'--network','none','--user','0:0','--memory','384m','--cap-drop','ALL','--security-opt','no-new-privileges','--env-file',str(env),'--mount','type=bind,src='+str(root/'uploads')+',dst=/data',image,'server','/data'])
 objects=[];lines=[];last_error=None
 for attempt in range(30):
  try:
   lines=run(client+['ls','--json','--recursive','restore/revolt-uploads']).stdout.decode().splitlines()
   objects=[json.loads(line) for line in lines if json.loads(line).get('type')=='file'];break
  except subprocess.CalledProcessError as error:last_error=error;time.sleep(1)
 metadata=json.loads((root/'object-metadata.json').read_text())
 records=[x['record'] for x in metadata['files'] if x['collection']=='attachment_hashes']
 if len(records)!=1:raise RuntimeError('Owned restored file encryption metadata missing')
 record=records[0]
 if record['bucket_id']!='revolt-uploads':raise RuntimeError('Unexpected owned file bucket')
 matches=[x for x in objects if x['key']==record['path']]
 if len(matches)!=1:raise RuntimeError('Owned object missing from restored bucket')
 if matches[0].get('size',0)>65536:raise RuntimeError('Owned QA object unexpectedly large')
 content=run(client+['cat','restore/revolt-uploads/'+record['path']]).stdout
 # Upstream v0.15.5 uses AES-256-GCM with a base64 12-byte IV and trailing 16-byte tag.
 # https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/files/src/implementation/encryption_impl.rs
 key=next(line.split('=',1)[1] for line in (root/'secrets.env').read_text().splitlines() if line.startswith('REVOLT__FILES__ENCRYPTION_KEY='))
 payload=private/'verify.json';payload.write_text(json.dumps({'key':key,'iv':record['iv'],'ciphertext':base64.b64encode(content).decode(),'expected':base64.b64encode(expected).decode()}))
 node_image=run(['docker','inspect','rooms-core-access-1','--format','{{.Config.Image}}']).stdout.decode().strip()
 code="const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');const p=JSON.parse(fs.readFileSync('/verify/verify.json'));const b=Buffer.from(p.ciphertext,'base64');const d=crypto.createDecipheriv('aes-256-gcm',Buffer.from(p.key,'base64'),Buffer.from(p.iv,'base64'));d.setAuthTag(b.subarray(-16));const plain=Buffer.concat([d.update(b.subarray(0,-16)),d.final()]);assert.deepEqual(plain,Buffer.from(p.expected,'base64'));process.stdout.write('OWNED_OBJECT_MATCHED');"
 decoded=run(['docker','run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','128m','--pids-limit','64','--mount','type=bind,src='+str(private)+',dst=/verify,readonly',node_image,'node','-e',code]).stdout
 if decoded!=b'OWNED_OBJECT_MATCHED':raise RuntimeError('Authenticated restored file verification failed')
 result={'at':datetime.now(timezone.utc).isoformat(),'liveRestoredObjectReadPassed':True,'knownOwnedObjectBytesMatched':True,'restoredEncryptionKeyAndMetadataVerified':True,'gcmAuthenticationTagVerified':True,'network':'none','publishedPorts':False,'productionObjectStoreModified':False}
 Path('/opt/rooms/OBJECT_READ_RESTORE_RESULTS.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
finally:
 subprocess.run(['docker','rm','-f',name],capture_output=True)
 shutil.rmtree(private)
