# Coach UI preview — 2026-11-26

Scope: isolated, synthetic-data UX prototype at previews/coach/index.html. This is not the production Coach UI or an LLM integration. Open the HTML directly or serve its directory using a static server.

Includes chat sample replies, daily decision, proposed Thursday-to-Friday run move, explicit accept/reject, undo, reset, simulated loading/cancellation and offline indication. State lives only in memory and resets on reload. No network requests, storage access, dependencies or service worker registration. Safety keyword responses are illustrative, not a production symptom classifier.

Validation: existing frontend suite 64/64 passed; inline JavaScript syntax check passed. Chromium visual inspection and accept/undo/reject interactions passed. Installed iPhone PWA, keyboard and actual device behavior were not tested. Production engine integration, persistence failure handling, actual LLM/timeout/429 behavior remain out of scope.

Review: open preview, choose Päivän treenipäätös; confirm original day remains until acceptance; accept and undo; reject a new proposal; reset. Compare the source diff: only this document and the preview are added.

Risks: prototype copy and keyword routing must not be mistaken for validated coaching logic. All inputs are rendered as text. No real user data should be entered. No PWA identity, storage keys, history, APIs or production files change.

Rollback: close/remove the isolated preview; no data migration or persistent state. This draft is not approved for merge or production publication.

## Local engine integration
Daily decisions now use src/coach/engine.mjs with four selectable synthetic check-ins. The engine proposes shortening to 20 minutes, not the previous hard-coded move. Symptoms or missing symptom information block proposals. Acceptance revalidates and rejects stale context. No actual application storage or backend integration. Other chat replies remain illustrative. Serve the repository root and open /previews/coach/ (ES modules require HTTP).

Validation: 67/67 automated tests pass, including scenario decisions, stale/tampered acceptance and immutable state. iPhone PWA verification remains outstanding.
