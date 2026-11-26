import { readFile } from 'node:fs/promises';

const patchNotes = await readFile(new URL('./patch-notes.html', import.meta.url), 'utf8');
export const homeMotionFiles = new Set(['home-motion.css', 'home-motion.js', 'phase-one.css', 'phase-one.js']);

export function enhanceArcadeHome(html) {
  return html
    .replace('<div id="grid">', '<p><a href="hextris-offline.tar.gz" download>Download Hextris for offline play</a></p><div id="grid">')
    .replace('</head>', '<link rel="stylesheet" href="home-motion.css?v=1"><link rel="stylesheet" href="phase-one.css?v=1"></head>')
    .replace('</body>', '<script type="module" src="home-motion.js?v=1"></script><script defer src="phase-one.js?v=1"></script></body>')
    .replace('</section><section id="media-page"', `${patchNotes.trim()}</section><section id="media-page"`);
}
