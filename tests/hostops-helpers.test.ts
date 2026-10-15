import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
it.skipIf(process.platform === 'win32')(
  'validates privileged helper arguments and never calls running-only services healthy',
  () => {
    const result = execFileSync(
      'python3',
      [
        '-c',
        String.raw`
import importlib.util, json, tempfile, os
from types import SimpleNamespace
from unittest.mock import patch

def module(path):
    spec=importlib.util.spec_from_file_location('testhelper',path)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
terminal=module('infra/hostops/rooms-terminal-helper.py')
with patch.object(terminal.os,'geteuid',return_value=0), patch.object(terminal,'load_profile') as profile:
    for args in [[],['attach','owner','../../etc/passwd'],['sh','owner','83dc1b8e-1fb6-4b16-87e8-a9217795e6ad'],['create','owner','83dc1b8e-1fb6-4b16-87e8-a9217795e6ad','extra']]:
        try: terminal.main(args)
        except ValueError: pass
        else: raise AssertionError('unsafe arguments accepted')
    profile.assert_not_called()
status=module('infra/hostops/rooms-status-helper.py')
with tempfile.TemporaryDirectory() as directory:
    filename=os.path.join(directory,'status.json')
    with open(filename,'w') as output: json.dump({'containers':[{'name':'qa-api','label':'API'}]},output)
    status.CONFIG=filename
    trusted=SimpleNamespace(st_uid=0,st_mode=0o100600)
    with patch.object(status.os,'fstat',return_value=trusted):
        for running,health,expected in [(True,None,'unknown'),(True,'starting','unknown'),(True,'healthy','healthy'),(False,None,'unhealthy'),(True,'unhealthy','unhealthy')]:
            state={'Running':running}
            if health: state['Health']={'Status':health}
            # This is the only inspect projection the helper is allowed to consume.
            response=SimpleNamespace(stdout=(json.dumps(state)+'|2').encode())
            with patch.object(status.subprocess,'run',return_value=response) as run:
                measured=status.snapshot()
                assert measured['services'][0]['state']==expected
                assert measured['lastBackupAt'] is None
                assert 'Env' not in str(run.call_args)
    with patch.object(status.os,'fstat',return_value=SimpleNamespace(st_uid=0,st_mode=0o100666)):
        try: status.snapshot()
        except ValueError: pass
        else: raise AssertionError('writable helper configuration accepted')
print('Privileged helper boundary checks passed')
`,
      ],
      { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } },
    );
    expect(result).toContain('Privileged helper boundary checks passed');
  },
);
