#!/usr/bin/python3
"""Bounded maintenance for the dedicated ROOMS Compose project only."""
import os
import subprocess
import sys

services={'access','activities','api','autumn','caddy','crond','database','events','gifbox','january','media','minio','postgres','pushd','rabbit','redis'}
args=sys.argv[1:]
compose=['/usr/bin/docker','compose','-f','/opt/rooms/config/compose.yml']
if args==['status']:
    command=compose+['ps','--format','{{.Service}} {{.State}}']
elif len(args)==2 and args[0]=='restart' and args[1] in services:
    command=compose+['restart',args[1]]
else:
    print('Allowed: status | restart <known ROOMS service>',file=sys.stderr)
    sys.exit(2)
# Never inherit Docker endpoints, Compose overrides or executable search paths.
env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'}
sys.exit(subprocess.run(command,cwd='/',env=env).returncode)
