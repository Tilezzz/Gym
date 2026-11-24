# Stride · by Oivallus

**Stride** (formerly Ultra Performance) is a hybrid strength/endurance training PWA.

## Verified release status (23 Nov 2026)
- **Stride 6.5.0 has been merged** into `main` on 21 Nov 2026, via [PR #1](https://github.com/Tilezzz/Gym/pull/1).
- Merge commit: [`7f33647`](https://github.com/Tilezzz/Gym/commit/7f336478a9cc4dbcd174e85d81d3c7446c50e2a7). The original 6.5 stabilization commit `023dba1` is preserved.
- PR #1 reports **24 automated tests passed**, a successful GitHub Pages deployment (run `44907488282`) and successful Cloudflare `gym` production build, with code and deployed assets matching the reviewed source.
- Live use of Garmin/Oura and installed-iPhone PWA behavior remain **device-side acceptance checks**. This document does not claim they have been independently completed.
- Public app URL remains https://tilezzz.github.io/Gym/ ; GitHub repository remains `Tilezzz/Gym`.
- Current development priorities, including Smart Exercise Swap and a future AI Coach, must be confirmed by Stride Product HQ rather than inferred from older review notes.

## Critical compatibility constraints
- Manifest `id`, `start_url` and `scope` remain `./`; installed PWA identity and URL must not change during routine updates.
- The version-6 data schema and `localStorage` key `ultra-performance-v6-fresh-20261106` remain unchanged.
- Preserve existing service worker, Worker URL, OAuth credentials, device pairing identifiers, history and legacy migration labels.
- Workout history remains device-local. **No automatic cross-device synchronization is provided.**
- Do not uninstall the existing iPhone PWA or clear browser/site storage to force a visual or icon refresh.

## Automated checks
Run from repository root with Node.js 22+:

```sh
node --test tests/*.test.cjs
node --check sw.js
node -e "const fs=require('fs');const s=fs.readFileSync('index.html','utf8');const m=s.match(/<script type=\"module\">([\s\S]*?)<\/script>/);if(!m)throw Error('Missing module');fs.writeFileSync('/tmp/stride-module.mjs',m[1]);"
node --check /tmp/stride-module.mjs
```

These checks do not replace on-device acceptance for iOS, live Garmin/Oura integration, data preservation, and offline use. For rules on coding and safe release, read `AGENTS.md`.

## Safe release workflow
1. Verify the current `main` commit and open PRs; start a fresh feature branch for approved work.
2. Preserve installed PWA identity and device-local storage; test all touched integrations and workflows.
3. Create a **Draft PR** targeting `main` with test results, known limitations, data migration risks, and rollback instructions.
4. On the current iPhone installation, privately export and verify a readable JSON backup before storage-risking changes; do not clear or uninstall the existing app.
5. Verify current app data after update, offline startup, background/resume and Garmin/Oura pairing/duplicate imports.
6. Merge and production deployment require separate user approval. Normally bundle changes into at most one stable release per week.

**Source of truth:** GitHub for source, branches and PRs; product decisions belong to the Stride Product HQ; automated and on-device acceptance must be reported separately.
