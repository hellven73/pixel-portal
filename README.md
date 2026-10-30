# Pixel Portal

A responsive personal dashboard with a cinematic portal entrance, six persistent colour themes, and an original eight-game arcade. Built with HTML, CSS and vanilla JavaScript, without a build step.

## Included

- An animated entrance with a particle field, keyboard entry, theme previews, skip and replay controls.
- Violet Hour, Afterglow, Blue Hour, Rose Quartz, Golden State and Monochrome palettes.
- Eight complete local games: 2048, Neon Snake, Brick Breaker, Match Point, Noughts & Crosses, Reflex, Minefield and Pocket Pong. Includes favourites, search and category filters.
- A web search/address launchpad with editable bookmarks. Destinations open in new tabs.
- Three original procedural ambient soundscapes and a local audio-file player.
- An autosaving notebook with text export.
- Responsive layouts, keyboard controls and reduced-motion support.

## Run locally

Run `python3 -m http.server 8000 `, then visit http://localhost:8000.

Run `npm run check` to check both JavaScript files for syntax errors. There are no npm dependencies to install.

## GitHub Pages

In repository **Settings → Pages → Build and deployment**, select **Deploy from a branch**, choose **main** and **/ (root)**, then save. GitHub publishes the root `index.html` and its relative assets.

All local asset references are relative, so project subpaths work. There is no custom domain or hardcoded repository URL.

## Data and services

Preferences, favourites, scores, bookmarks and notebook text are saved in localStorage on this browser. Clearing site data removes them. Audio files play locally and are never uploaded. The app does not include accounts, cloud sync, a web proxy or a shared chat backend. Search and bookmarks use ordinary public web links. Google Fonts is optional; system fonts are used if it cannot load. There is no analytics or advertising code.

## Source layout

- `index.html` — semantic interface
- `style.css` — responsive styling, theme tokens and animation
- `app.js` — navigation, settings, storage, bookmarks, music and notes
- `games.js` — local game engines and controls
- `icon.svg` — original vector icon

All illustrations are CSS geometry or original vector shapes. No reference-site scripts or assets are bundled.
