# Pixel Portal — service-backed rebuild

An independent rebuild of the public features at the reference site. This repository does **not** contain that site's original server source, accounts, messages, balances, or private data.

## What is implemented

- **Games:** 4,440 catalogue entries from GMShelf, Fruit, GN Math, Seraph and Truffled, with search, source filters, pagination, favourites and embedded launchers. Game files and artwork remain on their existing external hosts. Some upstream paths are broken; catalogue membership does not guarantee a working game. The eight original offline games remain as an optional collection.
- **Browser:** real Scramjet 1.1.0, Bare-Mux, Libcurl Transport and Wisp-JS, served on a separate origin. Signed ten-minute tickets require a Pixel account before opening Wisp. Private-network and loopback destinations are blocked. Only destination ports 80/443 are enabled.
- **Accounts:** username/password registration and login, scrypt password hashes, expiring HTTP-only sessions and account save records.
- **Chat:** actual shared text channels with saved messages and deletion of your own messages. Voice calls, DMs and federation with the reference site's users are not implemented.
- **Marketplace:** 107 public reference listings (renamed where they include the old branding), real virtual-coin debits, duplicate-purchase protection, inventory, equipment, daily claims and local membership-pass expiry. Asset links remain external. These items do not grant benefits on the original site. New accounts start with 2,500 virtual coins; there are no real-money transactions.
- **AI:** a server-side OpenAI-compatible provider adapter, conversation UI, per-account limits and explicit disconnected status. No model or paid AI account is supplied. Without provider configuration, AI remains unavailable; no canned replies are substituted.
- **Other:** local-file music playback, three procedural ambient tracks, six themes, a portal entrance, local notebook with account sync, bookmarks, and an EmulatorJS launcher for user-supplied game files. The reference site's streaming music service is not copied. Emulator engines load from EmulatorJS's CDN.

## Run locally

Requires Node.js 24 or later.

1. Run `npm ci --ignore-scripts`.
2. Copy `.env.example` to `.env`.
3. Generate a random shared secret of at least 32 characters and place it in `PROXY_SHARED_SECRET`. Never commit `.env`.
4. In one terminal, run `npm start` (the app runs at http://localhost:8080).
5. In another terminal, run `npm run start:browser` (the browser service runs at http://localhost:8081).
6. Create a Pixel account to use chat, inventory and the browser.

`npm run dev` starts the main app on port 4173. `npm run check` checks JavaScript syntax. `npm test` runs integration checks using isolated temporary databases and a mocked AI provider.

## Deploy on Render

`render-free.yaml` provides a free preview of both services. The first live preview uses https://hellven73-pixel-portal.onrender.com and an isolated browser at https://hellven73-pixel-browser.onrender.com. Its SQLite data is ephemeral: accounts, chat and inventory can reset after a restart or deployment. Free services can sleep and share free-tier usage limits. It is not the durable production configuration.

`render.yaml` defines **two services** for durable deployment:

| Service | Purpose | Plan |
| --- | --- | --- |
| `hellven73-pixel-portal` | App, accounts, chat, shop, SQLite | Smallest paid compute plan, plus a 1 GB persistent disk |
| `hellven73-pixel-browser` | Isolated Scramjet/Wisp origin | Free compute plan |

The persistent app has an approximate base cost of **US$7.25/month** at the time this configuration was prepared, excluding AI usage and any usage overages. Do not apply the Blueprint until those charges have been approved. The free browser service can sleep and is subject to free-tier usage limits.

The shared proxy secret is generated in an environment group. The app reads the browser service's actual public hostname via a supported service environment-variable reference. The database is stored at `/var/data/portal.sqlite` on the persistent disk. Without that disk, accounts, messages and inventory can be lost on a restart or deploy.

The Blueprint was checked against Render's current public JSON Schema. The Render CLI was not available for platform-aware validation.

For AI, set `AI_BASE_URL`, `AI_MODEL` and `AI_API_KEY` in the main service's environment. Use the provider's base URL ending in `/v1`, not the full `/chat/completions` endpoint. An on-server local provider can use `AI_ALLOW_LOCAL=1` instead of an API key. The free Render browser service is not a model host.

## GitHub Pages

GitHub Pages can publish the frontend and catalogue, but cannot run either Node service. On static hosting, server-only features show their disconnected state. Use the Render application URL for the complete server-backed deployment.

## Data, source and verification limits

Game catalogues and marketplace metadata were retrieved from public endpoints on 31 October 2026. The snapshots contain titles, launch links, prices and item categories; game binaries and reference-site application bundles are not included. Referenced third-party games and artwork retain their owners' rights.

The application is a rebuild, not an exact copy of all behaviour. The original users, conversations, subscriptions, streaming integrations, administrator features and hidden services cannot be recovered from the public frontend. Scramjet's browser-side transport and externally hosted games require end-to-end checks on the eventual public HTTPS deployment. No claim is made that every external game or ROM format works.

See [NOTICE.md](NOTICE.md) for dependency credits and [LICENSE](LICENSE) for the application source license.
