# Complete Pixel Arcade integration

The main website now runs the full application from the owner's `hellven73/pixel-arcade` repository, pinned at `24df2de35ee1b4b9b86e1fbc88a8cdce3b401189`, with a consistent responsive layout. The previous Portal is retained at `/portal`; its existing APIs and emulator remain available.

Included: public and private chat servers/channels, edit/delete/reactions/pins/search/typing/member profiles; friends, accepted-friend DMs, blocking and reports; role and moderation tools; administration and audited coin grants; profiles, marketplace/ledger/gifts/rewards/referrals; multiplayer rooms and daily leaderboards; scientific/symbolic calculator and graphing; chess bots; notes, slides, sandboxed code projects, Google app links; custom HTML/URL games, favourites, playtime, media, themes, privacy/cover/Study controls, welcome and guided setup. The Portal catalogue is merged with duplicate names/URLs removed and rendered 48 entries at a time. Webported Games stays separate.

## Source and packaging

All app source files, including the original vendored licenses and Slope assets, are in `arcade-app.tar.gz`. `arcade-manifest.json` records the upstream commit, filenames and SHA-256 of the bundle. This is a deployable source bundle, not an external website iframe. The Node host verifies and extracts it on startup. To inspect or edit:

```sh
mkdir -p arcade-source
tar -xzf arcade-app.tar.gz -C arcade-source
# Edit the source. If changing backend-worker.ts, regenerate backend-worker.mjs
# with node:module stripTypeScriptTypes (the runtime loads the .mjs).
npm run package:arcade
npm run check
npm test
```

`arcade-runtime.mjs` supplies the original D1 interface using Node SQLite. Database batches are synchronous transactions, preserving the original coin balance triggers. The schema initializes once per new database. Arcade uses `arcade.sqlite` beside the Portal database because both apps have incompatible tables named sessions.

`/arcade-api/*` is same-origin, uses HttpOnly cookies, validates the owned-origin allowlist, caps request sizes and rate limits requests. Browser bearer tokens and the former external API endpoint are removed from the new client. Current Portal account names/passwords/balances import once locally; the old Portal and its cosmetics/saves remain available. This does not copy the separate old GitHub site's remote account/chat database.

## Deployment configuration

- Keep `DB_PATH` and `STORAGE_MODE` accurate. Free Render storage is ephemeral; account/chat persistence requires a separately authorized persistent disk or database. Both apps show the storage notice when `STORAGE_MODE=ephemeral`.
- Set `PIXEL_ADMIN_USERNAME` only to the verified owner's existing lowercase Arcade account. With no value, administration and custom role assignment are disabled. First signup is never an administrator.
- AI uses the source app's lazy-loaded Puter integration and the visitor's own provider login/allowance. Existing server-configured AI is also retained in Portal. No provider key is committed.
- Protected FrameX TV requires the optional `FRAMEX_PASSWORD_HASH`, `FRAMEX_PASSWORD_SALT`, and `FRAMEX_SESSION_KEY` secrets. It remains locked when unconfigured.
- Scramjet uses the existing authenticated Render browser service; Direct mode is also retained. Third-party network/embedding failures remain visible rather than being reported as successful browsing.
- Privacy controls change the screen/title/favicon. They do not conceal network activity or device monitoring.

## Validation

`npm test` exercises ownership and moderator boundaries, private DM access and blocks, atomic purchases/gifts, replay-safe grants, multiplayer turns/versions, recovery-code replay and session revocation, legacy account import, source serving restrictions, plus the original Portal checks. Browser QA covers real calculator computation, slides creation/undo, the Code Lab sandbox and representative navigation. External game HTTP responses are link checks, not gameplay proof; hardware/provider limitations must be reported honestly.

## Interface renovation

The shell uses a shared SVG icon set, equal-size header controls, independently scrolling navigation and an aligned sidebar footer. The homepage has a new illustrated hero, a consistent shortcut grid, three collection cards and expandable secondary content. The redesigned welcome includes a centered interactive portal, three sculpture modes, keyboard/pointer interaction, skip/replay and reduced-motion support. Existing feature handlers and saved theme preferences are preserved.
