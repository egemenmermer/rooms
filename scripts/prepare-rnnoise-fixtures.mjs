import { mkdir, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Research fixtures stay in ignored .local; never bundle these recordings.
const directory = path.resolve('.local/rnnoise');
await mkdir(directory, { recursive: true });
const recordings = [
  { output: 'keyboard.wav', source: '1-137-A-32.wav', category: 'keyboard_typing' },
  { output: 'vacuum.wav', source: '1-100210-A-36.wav', category: 'vacuum_cleaner' },
];
const manifest = [];
for (const recording of recordings) {
  const url = `https://raw.githubusercontent.com/karolpiczak/ESC-50/master/audio/${recording.source}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fixture download failed: ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  await writeFile(path.join(directory, recording.output), data);
  manifest.push({
    ...recording,
    url,
    sha256: createHash('sha256').update(data).digest('hex'),
    license: 'ESC-50 CC BY-NC 3.0; upstream source clip licenses also apply',
    dataset: 'https://github.com/karolpiczak/ESC-50',
  });
}
try {
  await access(path.join(directory, 'speech.wav'));
} catch {
  if (process.platform !== 'darwin')
    throw new Error(
      'Provide a local speech.wav in .local/rnnoise before verification on this platform.',
    );
  execFileSync('say', [
    '--file-format=WAVE',
    '--data-format=LEI16@48000',
    '-o',
    path.join(directory, 'speech.wav'),
    'Rooms microphone test. We are talking while someone types on a keyboard. Please listen for clear words and background noise.',
  ]);
}
await writeFile(
  path.join(directory, 'sources.json'),
  JSON.stringify(
    {
      recordings: manifest,
      speech:
        'Local speech.wav fixture; macOS text-to-speech is generated only when missing. Record provenance separately for caller-supplied speech.',
    },
    null,
    2,
  ),
);
console.log('Prepared local research fixtures. Audio is excluded from application builds.');
