# Stride 6.5.0 — review notes (2026-11-20)

## Source and scope
- Base GitHub commit: `ec48929e0aeeeb17a55b70061628ef2a83f0d387` (`Tilezzz/Gym`, main).
- Local working branch name: `feature/6.5-stabilization` (only inside this local package; GitHub branch creation is blocked by integration 403).
- 6.5 changes: fail-visible save handling, defensive completed-set progression, rest timer undo, accessory-first budget trimming, PWA offline fallback and version labels.
- Brand changes: Stride header, S mark, favicon/Apple icon/PWA icons, manifest name/short_name, title, description, About attribution and export filenames. Preserve historical migration messages.
- Service worker now pre-caches Stride icons and only deletes `ultra-performance-v*` caches; other apps on the same origin are unaffected.

## Not modified
- `main` branch on GitHub, production Pages, `/Gym/` path, manifest `id/start_url/scope`, schema version 6, localStorage/IndexedDB/sessionStorage keys, Cloudflare Worker, OAuth configuration, user workout data.

## Automated test status
- Node test suite: see `test-results.txt` in this package.
- Browser/device acceptance: NOT RUN.
- Live Garmin/Oura sync: NOT RUN.
- Production release: NOT AUTHORIZED.

## Important constraints
- iOS may not update the installed icon/name automatically; don't remove the installed app to force refresh without a verified data backup.
- The test harness exercises pure engine functions and mocked SW behavior, not a full browser.
- There is no guarantee that an existing iPhone's local data has been backed up: only the user can export it from the device.
- The 6.5 features are incremental; no new cloud sync or large-scale refactor is included.
