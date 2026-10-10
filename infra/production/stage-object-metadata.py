#!/usr/bin/python3
"""Extract only the owned QA file metadata from the actual offline Mongo restore."""
from pathlib import Path
import subprocess,json,time
root=Path('/opt/rooms/restore-check');name='rooms-restore-filemeta'
def run(args,**kw):return subprocess.run(args,check=True,capture_output=True,**kw)
if subprocess.run(['docker','inspect',name],capture_output=True).returncode==0:raise RuntimeError('Inspect owned file metadata container first')
try:
 run(['docker','run','-d','--name',name,'--network','none','--memory','512m','mongo:7','--wiredTigerCacheSizeGB','0.25'])
 for attempt in range(30):
  if subprocess.run(['docker','exec',name,'mongosh','--quiet','--eval','db.adminCommand({ping:1})'],capture_output=True).returncode==0:break
  time.sleep(1)
 else:raise RuntimeError('Metadata restore failed readiness')
 with (root/'mongo.archive.gz').open('rb') as stream:run(['docker','exec','-i',name,'mongorestore','--archive','--gzip'],stdin=stream)
 file_id=(root/'object-id.txt').read_text().strip()
 code='const id='+json.dumps(file_id)+";const s=db.getSiblingDB('revolt');const attachment=s.attachments.findOne({_id:id});if(!attachment)throw new Error('Owned attachment missing');const found=[];for(const col of s.getCollectionNames()){const x=s.getCollection(col).findOne({_id:attachment.hash});if(x)found.push({collection:col,record:x});}print(JSON.stringify({attachment,files:found}));"
 metadata=json.loads(run(['docker','exec',name,'mongosh','--quiet','--eval',code]).stdout)
 path=root/'object-metadata.json';path.write_text(json.dumps(metadata));path.chmod(0o600)
 print(json.dumps({'ownedAttachmentFound':True,'fileRecordFields':[{m['collection']:list(m['record'])} for m in metadata['files']]}))
finally:subprocess.run(['docker','rm','-f','-v',name],capture_output=True)
