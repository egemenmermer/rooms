#!/usr/bin/python3 -I
"""Root-owned sudo entry point. Arguments select a configured unprivileged profile only."""
import json
import os
import pwd
import re
import stat
import subprocess
import time
import sys

CONFIG = '/etc/rooms-hostops/profiles.json'

def load_profile(profile_id):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', profile_id):
        raise ValueError('invalid profile')
    descriptor = os.open(CONFIG, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor) as stream:
        info = os.fstat(stream.fileno())
        if info.st_uid != 0 or info.st_mode & 0o022 or not stat.S_ISREG(info.st_mode):
            raise ValueError('untrusted profiles')
        profiles = json.load(stream)
    profile = profiles[profile_id]
    user = pwd.getpwnam(profile['user'])
    if user.pw_uid < 1000 or user.pw_uid == 65534 or user.pw_uid == os.getuid() and os.getuid() != 0:
        raise ValueError('dedicated non-system user required')
    directory = os.path.realpath(profile['directory'])
    if not directory.startswith('/') or not os.path.isdir(directory):
        raise ValueError('directory unavailable')
    return user, directory

def main(args):
    if os.geteuid() != 0 or len(args) != 3:
        raise ValueError('invalid invocation')
    verb, profile_id, session_id = args
    if verb not in ('exists', 'create', 'attach', 'close') or not re.fullmatch(
        r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', session_id
    ):
        raise ValueError('invalid action')
    user, directory = load_profile(profile_id)
    if verb == 'create':
        subprocess.run(['/usr/bin/systemctl', 'start', 'rooms-host-terminal@' + user.pw_name + '.service'],
                       env={'PATH':'/usr/bin:/bin'}, timeout=8, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        socket = '/run/rooms-host-terminal-' + user.pw_name + '/socket'
        for _ in range(40):
            try:
                st = os.stat(socket, follow_symlinks=False)
                if stat.S_ISSOCK(st.st_mode) and st.st_uid == user.pw_uid:
                    break
            except FileNotFoundError:
                pass
            time.sleep(0.05)
        else:
            raise ValueError('terminal server unavailable')
    # No root shell, supplementary groups, inherited tokens or Core mount privileges.
    os.setgroups([])
    os.setgid(user.pw_gid)
    os.setuid(user.pw_uid)
    os.umask(0o077)
    os.chdir(directory)
    env = {'PATH': '/usr/bin:/bin', 'HOME': user.pw_dir, 'USER': user.pw_name,
           'LOGNAME': user.pw_name, 'LANG': 'C.UTF-8', 'TERM': 'xterm-256color'}
    name = 'rooms-' + session_id
    base = ['/usr/bin/tmux', '-N', '-S', '/run/rooms-host-terminal-' + user.pw_name + '/socket', '-f', '/dev/null']
    if verb == 'create':
        # Fixed shell; no command, path, environment or tmux option comes from IPC.
        command = ['new-session', '-d', '-s', name, '-c', directory, '/bin/bash', '--noprofile', '--norc',
                   ';', 'set-option', '-t', name, 'history-limit', '2000',
                   ';', 'set-option', '-t', name, 'set-clipboard', 'off',
                   ';', 'set-option', '-t', name, 'status', 'off']
    elif verb == 'attach':
        command = ['attach-session', '-t', name]
    elif verb == 'exists':
        measured = subprocess.run(base + ['has-session', '-t', name], env=env, timeout=3,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if measured.returncode not in (0,1):
            raise ValueError('terminal lookup failed')
        print('exists' if measured.returncode == 0 else 'absent')
        return
    else:
        command = ['kill-session', '-t', name]
    os.execve(base[0], base + command, env)

if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Exception:
        print('Terminal action refused.', file=sys.stderr)
        sys.exit(2)
