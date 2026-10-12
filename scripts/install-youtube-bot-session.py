"""Explicit owner-approved dedicated YouTube session installation. Never extracts browser state."""
import sys, pathlib, http.cookiejar, subprocess, tempfile, os
if len(sys.argv)!=2:raise SystemExit('Provide the dedicated bot account Netscape cookies.txt file; never paste credentials into chat.')
source=pathlib.Path(sys.argv[1]).expanduser().resolve()
if not source.is_file() or source.stat().st_size>1024*1024:raise SystemExit('Invalid cookie file')
jar=http.cookiejar.MozillaCookieJar(str(source));jar.load(ignore_discard=True,ignore_expires=True)
selected=http.cookiejar.MozillaCookieJar()
for cookie in jar:
 domain=cookie.domain.lstrip('.').lower()
 if domain=='youtube.com' or domain.endswith('.youtube.com'):selected.set_cookie(cookie)
if not list(selected):raise SystemExit('No YouTube session cookies found')
ssh=['ssh','-i',str(pathlib.Path.home()/'.ssh/id_ed25519'),'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile=.local/ssh/known_hosts','root@62.238.119.134']
subprocess.run(ssh+['python3 /opt/rooms/backup.py'],check=True)
fd,path=tempfile.mkstemp(prefix='rooms-bot-session-');os.close(fd)
try:
 os.chmod(path,0o600);selected.save(path,ignore_discard=True,ignore_expires=True)
 # Private credential directory is outside all web/update roots and source/build contexts.
 subprocess.run(ssh+['umask 077; mkdir -p /opt/rooms/config/private-music; cat > /opt/rooms/config/private-music/youtube-cookies.txt.stage; chown 10001:10001 /opt/rooms/config/private-music/youtube-cookies.txt.stage; chmod 400 /opt/rooms/config/private-music/youtube-cookies.txt.stage; mv /opt/rooms/config/private-music/youtube-cookies.txt.stage /opt/rooms/config/private-music/youtube-cookies.txt'],input=pathlib.Path(path).read_bytes(),check=True)
 subprocess.run(ssh+['python3 -'],input=b'''from pathlib import Path
import yaml,subprocess,shutil,datetime
p=Path('/opt/rooms/config/compose.yml');shutil.copy2(p,p.with_name('compose.yml.before-youtube-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')))
c=yaml.safe_load(p.read_text());music=c['services']['music'];music.setdefault('environment',{})['ROOMS_YOUTUBE_COOKIE_FILE']='/run/rooms/youtube-cookies.txt';mount='./private-music/youtube-cookies.txt:/run/rooms/youtube-cookies.txt:ro';volumes=music.setdefault('volumes',[])
if mount not in volumes:volumes.append(mount)
p.write_text(yaml.safe_dump(c,sort_keys=False));p.chmod(0o600)
subprocess.run(['docker','compose','-p','rooms-core','-f',str(p),'up','-d','--no-deps','music'],check=True)
''',check=True)
finally:os.unlink(path)
print('Dedicated YouTube session installed privately. Actual provider playback still requires verification.')
