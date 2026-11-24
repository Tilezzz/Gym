# AGENTS.md — Stride (by Oivallus)

## Product and working model
- Stride (formerly Ultra Performance) is a hybrid strength/running PWA with adaptive sessions, workout history, and Garmin/Oura connections.
- Product HQ (Chat) prioritizes work and approves releases; Work handles substantial planning; Codex implements scoped changes, tests, and Draft PRs.
- Context from Product HQ / Work is not automatically accessible in a Codex task. Read the task's acceptance criteria and verify repo state before coding.
- Do not change Northstar or Horizon from this repo.

## Technical identity: preserve by default
- Repository: `Tilezzz/Gym`; public production path: `https://tilezzz.github.io/Gym/`.
- The existing installed PWA must retain its manifest identity, `./` start URL and scope, and service-worker compatibility.
- Preserve existing local data schema and key `ultra-performance-v6-fresh-20261106`; do not clear, rename, migrate, or overwrite user training history without a reviewed migration and explicit approval.
- Workout history is stored on each device; do not assume cross-device sync.
- Preserve existing Worker/Garmin/Oura credentials, pairing identifiers, integration behavior and endpoint paths. Never expose secrets in the repository or logs.
- Maintain the distinction between planned and completed exercise, muscle workload, weights, personal records, and exercise-swap history.

## Before editing
1. Verify `main`, open PRs, deployment record and active branch. Stride 6.5 was merged on 21 Nov 2026 through PR #1; the historical README from the pre-release review is not an up-to-date source.
2. Confirm the change is approved and scoped. Do not duplicate work already present on another branch.
3. Identify risks to device-local data, iOS PWA identity, offline behavior, and OAuth/Worker integrations.
4. Make changes on a feature/docs branch only; never commit to `main`.

## Checks (static root-level PWA)
- No package.json is required for the current root app.
- Run `node --test tests/*.test.cjs` and `node --check sw.js`.
- Also syntax-check the inline JavaScript module in `index.html` using the validated extraction command in `README.md` or a proven equivalent.
- Verify manifest JSON, changed filenames and diff, offline/service-worker behavior where touched, and no leaked secrets or user data.
- Distinguish automated checks from physical iPhone/iPad tests; report their separate results.

## Release and user-device safety
- User requested at most one stable release per week unless specifically overridden; scheduled reviews may recommend changes, not publish them.
- Before any update involving storage/PWA behavior, retain a readable private JSON export of the current iPhone app without uninstalling or clearing Safari/site storage.
- Device acceptance includes installed PWA launch, offline restart, background/resume, history and settings, service-worker/cache refresh, Garmin/Oura re-pairing and deduplication where applicable.
- Use a small Draft PR with tests, data/migration risks, user acceptance, and rollback plan. Never merge to `main` or deploy without separate explicit owner approval.
- Reuse current technical identifiers even when branding and visible names change.
