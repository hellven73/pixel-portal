import { readFile } from 'node:fs/promises';

const patchNotes = await readFile(new URL('./patch-notes.html', import.meta.url), 'utf8');
export const homeMotionFiles = new Set(['home-motion.css', 'home-motion.js', 'phase-one.css', 'phase-one.js', 'phase-two.js', 'phase-two.css', 'motion-polish.css', 'motion-polish.js', 'arcade.webmanifest', 'arcade-worker.js', 'arcade-offline.html', 'arcade-icon-192.png', 'arcade-icon-512.png']);

export function enhanceArcadeHome(html) {
  return html
    .replace('<div id="grid">', '<p><a href="hextris-offline.tar.gz" download>Download Hextris for offline play</a></p><div id="grid">')
    .replace('</head>', '<link rel="stylesheet" href="home-motion.css?v=1"><link rel="stylesheet" href="phase-one.css?v=1"><link rel="manifest" href="arcade.webmanifest"><link rel="apple-touch-icon" href="arcade-icon-192.png"><link rel="stylesheet" href="phase-two.css?v=1"><link rel="stylesheet" href="motion-polish.css?v=1"></head>')
    .replace('</body>', '<script type="module" src="home-motion.js?v=1"></script><script defer src="phase-one.js?v=2"></script><script defer src="phase-two.js?v=1"></script><script type="module" src="motion-polish.js?v=1"></script></body>')
    .replace('</section><section id="media-page"', `${patchNotes.trim()}</section><section id="media-page"`);
}
