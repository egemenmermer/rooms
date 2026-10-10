#!/usr/bin/env python3
"""Restore existing private dumps into disposable offline databases; never production."""
import json
from pathlib import Path
import subprocess
import time
from datetime import datetime,timezone

names=['rooms-restore-check-mongo','rooms-restore-check-postgres']

def run(args,**kwargs):
    return subprocess.run(args,check=True,capture_output=True,**kwargs)

for name in names:
    exists=subprocess.run(['docker','inspect',name],capture_output=True).returncode==0
    if exists: raise RuntimeError('Owned restore-check container already exists; inspect before retrying.')
try:
    run(['docker','run','-d','--name',names[0],'--network','none','--memory','512m','mongo:7','--wiredTigerCacheSizeGB','0.25'])
    run(['docker','run','-d','--name',names[1],'--network','none','--memory','256m','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'])
    for name,probe in [(names[0],['mongosh','--quiet','--eval','db.adminCommand({ping:1})']),(names[1],['pg_isready','-U','postgres'])]:
        for attempt in range(40):
            if subprocess.run(['docker','exec',name]+probe,capture_output=True).returncode==0: break
            time.sleep(1)
        else: raise RuntimeError('Isolated restore database failed readiness.')
    with Path('/opt/rooms/restore-check/mongo.archive.gz').open('rb') as stream:
        run(['docker','exec','-i',names[0],'mongorestore','--archive','--gzip'],stdin=stream)
    run(['docker','exec',names[1],'createdb','-U','postgres','rooms'])
    # Restore dump ownership into a temporary role, not a live account.
    run(['docker','exec',names[1],'psql','-U','postgres','-c','CREATE ROLE rooms_activity;'])
    with Path('/opt/rooms/restore-check/activity.sql').open('rb') as stream:
        run(['docker','exec','-i',names[1],'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','rooms'],stdin=stream)
    mongo=json.loads(run(['docker','exec',names[0],'mongosh','--quiet','--eval',"const s=db.getSiblingDB('revolt');print(JSON.stringify({users:s.users.countDocuments({}),servers:s.servers.countDocuments({}),channels:s.channels.countDocuments({})}));"]).stdout)
    tables=run(['docker','exec',names[1],'psql','-U','postgres','-d','rooms','-tAc',"SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"]).stdout.decode().strip()
    activity=json.loads(run(['docker','exec',names[1],'psql','-U','postgres','-d','rooms','-tAc',"SELECT json_build_object('rooms',count(*),'polls',coalesce(sum(jsonb_array_length(state->'snapshot'->'polls')),0),'notes',coalesce(sum(jsonb_array_length(state->'snapshot'->'whiteboard')),0)) FROM rooms_activity_state"]).stdout)
    game_archives=json.loads(run(['docker','exec',names[1],'psql','-U','postgres','-d','rooms','-tAc',"SELECT json_build_object('tables',count(*),'completedHands',coalesce(sum(jsonb_array_length(archive->'history')),0)) FROM rooms_activity_state, LATERAL jsonb_array_elements(coalesce(state->'gameArchives','[]'::jsonb)) archive"]).stdout)
    if game_archives['completedHands']<6: raise RuntimeError('Restored completed game history missing.')
    if mongo['users']<3 or mongo['servers']<1 or mongo['channels']<2 or int(tables)<1 or activity['rooms']<1 or activity['polls']<1 or activity['notes']<1: raise RuntimeError('Restored core records missing.')
    result={'verifiedAt':datetime.now(timezone.utc).isoformat(),'databaseRestorePassed':True,'productionDatabasesModified':False,'network':'none','publishedPorts':False,'mongoCounts':mongo,'postgresPublicTables':int(tables),'restoredActivityCounts':activity,'restoredGameArchiveCounts':game_archives,'uploadsAndTlsRestoreVerified':False}
    Path('/opt/rooms/RESTORE_RESULTS.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
finally:
    for name in names:
        subprocess.run(['docker','rm','-f','-v',name],capture_output=True)
