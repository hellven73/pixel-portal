import { readFile } from 'node:fs/promises';

const patchNotes = await readFile(new URL('./patch-notes.html', import.meta.url), 'utf8');
export const homeMotionFiles = new Set(['home-motion.css', 'home-motion.js', 'phase-one.css', 'phase-one.js', 'phase-two.js', 'phase-two.css', 'motion-polish.css', 'motion-polish.js', 'arcade.webmanifest', 'arcade-worker.js', 'arcade-offline.html', 'arcade-icon-192.png', 'arcade-icon-512.png', 'mobile.css', 'slope-touch.js']);

export function enhanceArcadeHome(html) {
  return html
    .replace('<div id="grid">', '<p><a href="hextris-offline.tar.gz" download>Download Hextris for offline play</a></p><div id="grid">')
    .replace('</head>', '<link rel="stylesheet" href="home-motion.css?v=1"><link rel="stylesheet" href="phase-one.css?v=1"><link rel="manifest" href="arcade.webmanifest"><link rel="apple-touch-icon" href="arcade-icon-192.png"><link rel="stylesheet" href="phase-two.css?v=1"><link rel="stylesheet" href="motion-polish.css?v=1"></head>')
    .replace('</body>', '<script type="module" src="home-motion.js?v=1"></script><script defer src="phase-one.js?v=2"></script><script defer src="phase-two.js?v=1"></script><script type="module" src="motion-polish.js?v=1"></script></body>')
    .replace('</section><section id="media-page"', `${patchNotes.trim()}</section><section id="media-page"`);
}


export function enhanceArcadeMobile(html, file) {
  if (!['index.html', 'arcade.html', 'hextris.html', 'slope.html', 'q2.html', 'manual.html', 'terms.html'].includes(file)) return html;
  const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">';
  html = html.replace(/<meta\b[^>]*name=["']viewport["'][^>]*>/i, viewport)
    .replace('</head>', '<link rel="stylesheet" href="mobile.css?v=1"></head>');
  if (file === 'slope.html') {
    return html.replace('</nav>', '</nav><div id="slope-touch" role="group" aria-label="Touch steering"><button type="button" data-key="ArrowLeft" aria-label="Steer left">←</button><button type="button" data-key="ArrowRight" aria-label="Steer right">→</button></div>')
      .replace('WebGL graphics required · Keyboard recommended','WebGL graphics required')
      .replace('</body>', '<script type="module" src="slope-touch.js?v=1"></script></body>');
  }
  if (file === 'q2.html') {
    return html.replace('<section id="setup">','<section id="setup"><p class="mobile-keyboard-note">Bring a keyboard and mouse to play Quake II.</p>');
  }
  return html;
}
