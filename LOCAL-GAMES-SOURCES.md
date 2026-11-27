# PixelArcade local game sources

PixelArcade serves the following browser games from its own origin. Upstream game assets and source files are included directly rather than embedding third-party sites.

| Game | Upstream | Redistribution | Notes |
| --- | --- | --- | --- |
| Hextris | https://github.com/Hextris/hextris | GPL-3.0 | Existing locally hosted game, with source archive and licence |
| 2048 | https://github.com/gabrielecirulli/2048 | MIT | Original HTML, JavaScript, styles, fonts, images, and licence |
| Snakes | https://github.com/jakesgordon/javascript-snakes | MIT | The original `experiments/minimal` edition, with licence |
| Tiny Platformer | https://github.com/jakesgordon/javascript-tiny-platformer | MIT | Original playable platformer, tiles, and source |
| Tetris | https://github.com/jakesgordon/javascript-tetris | MIT | Original HTML5 Tetris, including the texture and licence |
| Breakout | https://github.com/pemmyz/js_breakout | MIT | Original Breakout with keyboard, touch, and gamepad support |
| Slope | Existing bundled PixelArcade release | Verify rights separately | Kept from the previous first-party installation; not represented as open-source |
| Quake II | https://github.com/GMH-Code/Qwasm2 | GPL-2.0 engine | No copyrighted commercial game files bundled; users supply their own legitimate data |

The imported games live in `oss-games/<game>/` and preserve their upstream licence files. Original `2048`, `Tetris`, `Snakes`, `Tiny Platformer`, and `Breakout` source is imported unmodified; the UI around it remains PixelArcade's.

The former third-party game collection and webported commercial downloads are no longer advertised in the launcher. Importing a browser build, obtaining a mirror, or finding a public repository does not by itself grant permission to redistribute proprietary game assets.

CloudMoon is an online service and remains unchanged, as do non-game external applications such as the browser and music services. Local hosting means no game iframe or game download depends on a third-party host; it does not guarantee offline availability until the browser caches the files. Quake II additionally requires the user's own commercial game data.

The canonical local game list is `local-library.json`; `prepare-local-games.mjs` installs its assets and rebuilds the archived Arcade catalogue during a release.
