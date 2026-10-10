#!/usr/bin/env python3
"""Verify the production authorization role without returning credentials or records."""
import json
import re
from pathlib import Path
import subprocess
from datetime import datetime,timezone
script="""const p=JSON.parse(require('fs').readFileSync('/run/rooms/private.json','utf8'));
const social=db.getSiblingDB('revolt');
if(!social.auth('rooms_reader',p.mongo_reader))throw new Error('Reader authentication failed');
const checks={membershipReadAllowed:false,accountsReadDenied:false,sessionsReadDenied:false,writeDenied:false};
social.server_members.findOne({});checks.membershipReadAllowed=true;
for(const [collection,key] of [['accounts','accountsReadDenied'],['sessions','sessionsReadDenied']]){
 try{social.getCollection(collection).findOne({});}catch(e){if(e.code===13)checks[key]=true;else throw e;}
}
// Empty bulk update changes no records even if privileges are unexpectedly excessive.
try{social.server_members.updateMany({_id:'rooms-authorization-no-existing-record'},{$set:{rooms_test_noop:true}});}catch(e){if(e.code===13)checks.writeDenied=true;else throw e;}
if(!Object.values(checks).every(Boolean))throw new Error('Scoped role denied-access acceptance failed');
print(JSON.stringify(checks));
"""
result=subprocess.run(['docker','compose','-f','/opt/rooms/config/compose.yml','exec','-T','database','mongosh','--quiet'],input=script,text=True,capture_output=True)
if result.returncode: raise RuntimeError('Authorization role acceptance failed; private output withheld.')
match=re.search(r'\{"membershipReadAllowed"[^\n]*?\}',result.stdout)
line=match.group(0) if match else None
if not line: raise RuntimeError('Authorization evidence missing.')
checks=json.loads(line)
report={'at':datetime.now(timezone.utc).isoformat(),'verified':True,**checks}
Path('/opt/rooms/AUTHORIZATION_RESULTS.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
