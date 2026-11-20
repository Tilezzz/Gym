# Stride · by Oivallus

**Stride** (formerly Ultra Performance) is a hybrid strength/endurance training PWA. The product name and visuals have changed; the **technical identity and user data have not**.

- Production URL remains `https://tilezzz.github.io/Gym/`.
- GitHub repository remains `Tilezzz/Gym`.
- Manifest `id`, `start_url`, and `scope` remain `./`.
- The version-6 data schema and `localStorage` key `ultra-performance-v6-fresh-20261106` remain unchanged.
- Existing Worker URL, OAuth credentials and device pairing identifiers remain unchanged.
- Legacy history and migration labels remain unchanged.
- No cross-device synchronization is added; workout history stays in the existing device's browser storage.

## Development status

This is a **local review candidate for Stride 6.5.0**, built from the exact file contents of GitHub `main` at commit `ec48929e0aeeeb17a55b70061628ef2a83f0d387`, plus the previously approved 6.5 stabilization changes and the approved Stride brand assets. It is **not published**. The connected GitHub integration returned HTTP 403 when creating a branch; no remote branch or PR exists yet.

All `Stride/` assets in the provided `Oivallus-brand-kit-v1(1).zip` were copied **byte-for-byte**. The S mark is used in the app header; the 180px icon is used for Apple touch, and 192/512px icons are used in the PWA manifest with `purpose: any`.

## Automated checks

Run from the project root with Node.js 22+:

```bash
node --test tests/*.test.cjs
node --check sw.js
node -e "const fs=require('fs'); const s=fs.readFileSync('index.html','utf8'); const m=s.match(/<script type=\"module\">([\s\S]*?)<\/script>/); if(!m)throw Error('Missing module');fs.writeFileSync('/tmp/stride-module.mjs',m[1]);"
node --check /tmp/stride-module.mjs
```

The automated suite checks state roundtrip, incomplete work sets, conservative progression, time budgets, PWA technical identity, brand asset references and offline service-worker behavior. **Automated tests do not replace the 24-case acceptance plan**, especially Garmin/Oura live sync and real iOS installed-PWA behavior.

## Safe PR workflow

1. Clone `Tilezzz/Gym` and verify `git rev-parse HEAD` equals `ec48929e0aeeeb17a55b70061628ef2a83f0d387`. If `main` moved, compare changes before applying anything.
2. Create `feature/6.5-stabilization` from the verified commit; do not modify `main` directly.
3. Apply the included `stride-6.5-review.patch` to that branch (`git apply --check ...` then `git apply ...`), or use the full source files supplied in this package after reviewing the diff.
4. Run tests and inspect `git diff`. Do not include local backups, Worker tokens, OAuth secrets or user JSON history.
5. Push only the feature branch and open a **draft PR**. Do not merge or publish without separate approval.

## Mandatory iPhone / iPad acceptance

1. From the **currently installed iPhone app**, export JSON and retain it privately. Verify that it is nonempty and readable. Do not uninstall the PWA or clear Safari/site data.
2. On an isolated test environment, restore a disposable backup and compare history counts, completed sets, planned sessions and settings before/after the update.
3. Check existing installed-app identity, home-screen icon/name behavior (iOS may keep old icon/name), offline launch, session continuation after backgrounding, and service-worker updates. Do not force an icon refresh by deleting the installed app.
4. Verify Garmin and Oura connections remain paired; import the same activities twice and confirm no duplicates or overwritten manual strength sets.
5. Review rollback: restore prior code and service worker without replacing any newer device-local workout data.

**Release gate:** all P0 and P1 acceptance criteria passed, no data loss, separate explicit owner approval, and at most one stable release per week.
