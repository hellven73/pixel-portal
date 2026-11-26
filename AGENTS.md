# PixelArcade releases

- Publish approved site updates to both https://pixelarcade.com.au/ and https://hellven73.github.io/pixel/.
- After completing a major update, add a dated, user-facing entry to `patch-notes.html` before publishing. Keep the newest entry first.
- The custom domain deploys from this repository's `main` branch on Render. After verifying the source build, advance the pinned `pixel-portal` revision in `hellven73/pixel` at `.github/workflows/pages.yml` to publish the same update to GitHub Pages.
- Verify the feature and any patch note on both live URLs before reporting the release complete.
