import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const games = [
  {
    archive: 'hextris-offline.tar.gz',
    files: ['hextris-LICENSE.txt', 'hextris-source.tar.gz', 'hextris-SOURCE.md'],
    instructions: 'Extract all files, then open hextris.html in your browser. Internet access is optional for the social and store links.',
  },
  {
    archive: 'quake-ii-offline.tar.gz',
    files: ['q2.html', 'q2-engine.js', 'q2-launcher.js', 'index.data', 'index.wasm',
      'game_baseq2.wasm', 'ref_gl1.wasm', 'ref_gles3.wasm', 'ref_soft.wasm', 'q2-license.txt', 'q2-source.txt', 'q2-source.tar.gz', 'q2-gl4es-source.tar.gz'],
    instructions: 'Extract all files. In that folder run python3 -m http.server --bind 127.0.0.1 8765. Open http://127.0.0.1:8765/q2.html and select your own Quake II pak0.pak. The game data and Python are separate requirements.',
  },
];

export async function prepareOfflineGames(directory) {
  const temp = await mkdtemp(join(tmpdir(), 'pixel-offline-'));
  try {
    const hextris = await readFile(join(directory, 'hextris.html'), 'utf8');
    const offlineHextris = hextris.replace(/<!-- Google tag \(gtag\.js\) -->[\s\S]*?<\/script>\s*<script>[\s\S]*?<\/script>/, '');
    await writeFile(join(temp, 'hextris.html'), offlineHextris);
    for (const game of games) {
      await writeFile(join(temp, 'READ-ME.txt'), game.instructions + '\n');
      const extras = game.archive.startsWith('hextris') ? ['hextris.html'] : [];
      await run('tar', ['-czf', join(directory, game.archive), '-C', directory,
        ...game.files, '-C', temp, 'READ-ME.txt', ...extras]);
    }
    return games.map(game => game.archive);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
