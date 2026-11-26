import { readFile } from 'node:fs/promises';

const patchNotes = await readFile(new URL('./patch-notes.html', import.meta.url), 'utf8');
export const homeMotionFiles = new Set(['home-motion.css', 'home-motion.js']);

export function enhanceArcadeHome(html) {
  return html
    .replace('</head>', '<link rel="stylesheet" href="home-motion.css?v=1"></head>')
    .replace('</body>', '<script type="module" src="home-motion.js?v=1"></script></body>')
    .replace('</section><section id="media-page"', `${patchNotes.trim()}</section><section id="media-page"`);
}
