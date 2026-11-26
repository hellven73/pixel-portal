# Phase 1: Discovery

The existing Arcade launcher, game eligibility policy, favourites and account statistics remain authoritative. The home enhancer loads the three new assets on Render, Vercel source builds and GitHub Pages. No dependencies or server APIs were added.

- Ctrl/Cmd+K opens a native modal command palette. It is not activated during gameplay or another modal.
- Surprise Me opens a category-aware roulette with optional synthesized sound. Reduced motion skips the spin animation.
- Continue Playing stores up to 40 latest launches on this browser and shows six. Duration represents visible embedded player time, not verified gameplay. External launch duration is unavailable. High-end preflight is not counted; historical account totals are not fabricated as individual sessions. Relaunch does not restore unsupported game state.
- Browser history is per origin and not synced between deployment URLs or devices. Clearing browser data removes it. Existing account statistics are unchanged.

## Before release

Run npm run check, npm test, npm run build:pages. Use a browser to verify both base paths, keyboard navigation and focus restoration, search matches, favourite reuse, category roulette, sound, reduced motion, mobile layout, guest history across reload, background-tab timing, provider launch and existing game compatibility. Verify both production URLs after approval; do not merge or advance the Pages pin until approved.
