# STR-AI-01 PR 1 — local Coach Engine foundations

This PR implements the first approved increment of the 24 November 2026 architecture plan. It is deliberately **not imported by index.html or precached by sw.js**. There is no changed production behaviour, API call, storage write, migration or deployment configuration. All examples and tests are synthetic.

## Files and entry points

- `src/coach/contracts.mjs`: bounded wire contracts and dependency-free runtime validation of their JSON Schema keywords; dates, ranges, source provenance and cross-field checks.
- `src/coach/contracts.schema.json`: portable draft 2020-12 schemas for context, decision, proposal and model reply. This is a generated snapshot of the exports; a test guards parity. Runtime validation additionally enforces semantic rules.
- `src/coach/context.mjs`: read-only v6 adapter, freshness, history summaries, performed-exercise history, within-source median recovery baseline and descriptive weekly comparison.
- `src/coach/engine.mjs`: deterministic `evaluateCoach(context, now, ruleVersion)` plus decision/proposal/model-envelope validation. No function applies a proposal or records approval.
- `tests/fixtures/coach/single-poor-night.json`: 4.7 h sleep, energy 2/5, explicitly confirmed isolated night, no symptoms, a 40-minute easy run. Result: ease, a proposed 20-minute session, no mutation.

Use `.mjs` to share the same ESM with a future Worker and browser without changing this repository's package/build setup. No dependencies were added. Time and timezone are explicit inputs; no Date.now, random IDs, localStorage, network, DOM or scheduling dependency.

## Contract refinements from the architecture specification

These are transient coach contract fields, **not additions to persisted v6 data**:

- `sleep_pattern` records the user's confirmation of a single/repeated poor night. Absence asks for clarification instead of assuming one isolated night.
- `activePlanRef` and `hasActiveSession` prevent an active (including unplanned) workout from becoming a mutable proposal.
- `planCoverage` states the date range and completeness of the at-most-seven plans. Truncation cannot manufacture an empty destination date.
- Load summaries add `knownSrpeLoadUpper` and `possibleDuplicateCount`. Ambiguous duplicates yield a conservative interval; their history records remain untouched. Run minutes and sets are upper totals in that case, not a deduplicated certainty.
- Standalone evidence metric values are bounded; the adapter never invents measurement provenance. Existing v6 recovery rows merge manual/device fields and lack reliable sample timestamps. Only known manual energy/legs and affirmative symptom flags are extracted, as time-unknown. Fresh, explicitly sourced observations can be supplied separately. A legacy `pain:false` is not a fresh confirmation of symptom absence.

Freshness uses observation age and local measurement day, never a fresh fetch/snapshot time. The adapter does not synchronize or invoke the production importer/adaptAfter. The `coverageKnown` input must be established by a future caller; it defaults false. A populated history alone cannot prove that missing days were rest days.

## Safety and scope

The engine uses conservative product heuristics, not a clinical model. Symptoms are structured values supplied by a trusted future check-in adapter. Free-text symptom detection, clinical escalation copy, LLM evaluation, authentication and UI consent belong to later increments; this module cannot make arbitrary chat medically safe. The model reply validator checks structure, evidence references and proposed operations, **not natural-language truth or safety**.

Current daily assessment targets the first planned workout today; no implicit selection of a different future session. Future-target conversational assessment needs an explicit target contract before UI integration. Moves require a complete schedule, known load without missing RPE, an empty target day within seven days, and no adjacent planned strength/quality/long session; otherwise validation returns a review error. This conservative rule can reject a reasonable move and must not be presented as a medical contraindication.

No automatic progression/split changes. HRV/resting-HR baselines are descriptive utilities, not a decisive score. Completed strength history uses performed exerciseId only, never plannedExerciseId. Planned sets do not count. Deduplication uses same-source IDs, explicit Garmin links or exact cross-source sport/time/duration matches; less certain overlap stays an interval. Conflicting RPE becomes unknown rather than arbitrarily choosing one value.

The weekly comparator uses four adjacent seven-calendar-day windows and requires known coverage with at least 80% RPE completeness in every window. The 48-hour summary uses elapsed time. No ACWR injury prediction. Recovery medians exclude the current three-night window from the preceding 21-day baseline and require seven unique baseline nights and two recent nights. Neither exported helper silently contributes inferred data to a measured observation.

## Verification and review

Run `node --test tests/*.test.cjs`. Tests cover the existing 24 cases plus coach decisions, missing/old/conflicting information, symptoms, injection-shaped unknown keys, malformed clocks/dates, DST, locks/active sessions, schedule truncation, RPE absence, duplicate import order, load intervals, per-exercise history and frozen-input invariance. A generated-decision sweep validates 90 combinations of energy, sleep, symptom and lock state. Syntax and manifest checks from existing CI remain applicable.

Local verification used Node 24.22.3; GitHub CI config uses Node 22. A remote CI result must be checked separately, not inferred from local success. No browser/iPhone test is claimed because this PR does not wire production UI. No live provider tests were performed.

Reviewer order: (1) confirm no production wiring or v6 changes; (2) trace provenance and missing-data handling; (3) review symptom and proposal gates; (4) inspect deduplication and frozen-input tests; (5) verify baseline/weekly comparisons are descriptive only. Numeric thresholds and symptom UI wording still require domain review before user-facing integration.

## Rollback

Revert this commit to remove unused modules, schemas, fixture, tests and this document. There is no new persisted user data to migrate or delete. Keep `/Gym/`, manifest identity, the v6 localStorage key, IndexedDB device credentials, Garmin/Oura connections, current SW and active workout data unchanged. Do not merge or deploy without separate approval.
