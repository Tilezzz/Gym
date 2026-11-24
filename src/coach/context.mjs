import { SCHEMA_VERSION, assertContext, dayOffset, localDay, validInstant, validateSchema, evidenceSchema } from './contracts.mjs';
const finite = x => typeof x === 'number' && Number.isFinite(x);
const validRpe = x => finite(x) && x >= 1 && x <= 10;
const start = a => validInstant(a.startedAt) ? Date.parse(a.startedAt) : NaN;
const duration = a => finite(a.duration) && a.duration > 0 && a.duration <= 2000 ? a.duration : 0;
const end = a => start(a) + duration(a) * 60000;
const priority = a => ({ manual: 0, garmin: 1, oura: 2 }[a.source] ?? 3);
const order = (a, b) => priority(a) - priority(b) || String(a.id || '').localeCompare(String(b.id || '')) || JSON.stringify(a).localeCompare(JSON.stringify(b));
function sameRecord(a, b) {
  if (a.source === b.source) return !!a.externalId && a.externalId === b.externalId;
  if (a.garminExternalId && a.garminExternalId === b.externalId || b.garminExternalId && b.garminExternalId === a.externalId) return true;
  return ['manual', 'garmin', 'oura'].includes(a.source) && ['manual', 'garmin', 'oura'].includes(b.source)
    && a.sport === b.sport && Number.isFinite(start(a)) && start(a) === start(b) && duration(a) > 0 && duration(a) === duration(b);
}
function overlap(a, b) {
  if (a.sport !== b.sport || a.source === b.source) return false;
  const shared = Math.max(0, Math.min(end(a), end(b)) - Math.max(start(a), start(b)));
  return shared / Math.min(duration(a), duration(b)) / 60000 >= 0.65;
}
function normalizedActivities(activities) {
  const sorted = [...activities].filter(a => a && typeof a === 'object').sort(order);
  const groups = [], index = new Map();
  for (const row of sorted) {
    const keys = [];
    if (row.externalId) keys.push(JSON.stringify(['external', row.source, row.externalId]));
    if (row.garminExternalId) keys.push(JSON.stringify(['external', 'garmin', row.garminExternalId]));
    if (Number.isFinite(start(row)) && duration(row)) keys.push(JSON.stringify(['exact', row.sport, start(row), duration(row)]));
    const candidates = new Set(keys.flatMap(key => index.get(key) || []));
    // Complete-link matching avoids collapsing a chain of separate sessions.
    let group = [...candidates].find(xs => xs.every(x => sameRecord(x, row)));
    if (group) group.push(row); else { group = [row]; groups.push(group); }
    for (const key of keys) { const entries = index.get(key) || []; if (!entries.includes(group)) entries.push(group); index.set(key, entries); }
  }
  return groups.map(rows => {
    const first = rows[0];
    const objective = rows.find(a => a.source === 'garmin') || first;
    const rpes = [...new Set(rows.map(a => a.sessionRpe).filter(validRpe))];
    return { ...first, duration: duration(objective), startedAt: objective.startedAt,
      sessionRpe: rpes.length === 1 ? rpes[0] : null,
      sets: rows.find(a => a.source === 'manual' && Array.isArray(a.sets))?.sets || first.sets || [] };
  });
}
/** Pure read model; never writes back deduplicated rows into the v6 history. */
export function summarizeHistory(activities, now, timezone, coverageKnown = false) {
  const day = localDay(now, timezone), time = Date.parse(now);
  const rows = normalizedActivities(activities);
  const invalid = rows.some(a => !Number.isFinite(start(a)) || !duration(a) || start(a) > time);
  const windows = [2, 7, 28].map(windowDays => {
    const selected = rows.filter(a => Number.isFinite(start(a)) && start(a) <= time && duration(a) > 0
      && (windowDays === 2 ? start(a) >= time - 48 * 3600000 : localDay(a.startedAt, timezone) >= dayOffset(day, 1 - windowDays)));
    const pairs = [];
    for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) if (overlap(selected[i], selected[j])) pairs.push([i, j]);
    // Connected components give a conservative lower bound for ambiguous matches.
    const parents = selected.map((_, i) => i);
    const root = i => parents[i] === i ? i : root(parents[i]);
    for (const [i, j] of pairs) parents[root(j)] = root(i);
    const loads = selected.map(a => validRpe(a.sessionRpe) ? duration(a) * a.sessionRpe : 0);
    const minimums = new Map();
    loads.forEach((load, i) => minimums.set(root(i), Math.max(minimums.get(root(i)) || 0, load)));
    return { windowDays, knownSrpeLoad: [...minimums.values()].reduce((a, b) => a + b, 0),
      knownSrpeLoadUpper: loads.reduce((a, b) => a + b, 0),
      unknownRpeMinutes: selected.filter(a => !validRpe(a.sessionRpe)).reduce((s, a) => s + duration(a), 0),
      runMinutes: selected.filter(a => a.sport === 'run').reduce((s, a) => s + duration(a), 0),
      strengthSets: selected.filter(a => a.sport === 'strength').reduce((s, a) => s + completedSets(a).length, 0),
      coverageKnown: coverageKnown === true && !invalid && pairs.length === 0, possibleDuplicateCount: pairs.length };
  });
  return windows;
}
function completedSets(a) {
  return (Array.isArray(a.sets) ? a.sets : []).filter(s => s && s.done === true && typeof s.exerciseId === 'string'
    && finite(s.reps) && s.reps >= 1 && finite(s.weight) && s.weight >= 0);
}
/** Performed IDs only. Planned IDs and uncompleted proposals cannot create PRs. */
export function strengthHistory(activities) {
  const result = Object.create(null);
  for (const a of normalizedActivities(activities).filter(a => a.sport === 'strength')) {
    for (const s of completedSets(a)) {
      (result[s.exerciseId] ||= []).push({ startedAt: a.startedAt, weight: s.weight, reps: s.reps,
        rir: finite(s.rir) && s.rir >= 0 && s.rir <= 6 ? s.rir : null });
    }
  }
  for (const sets of Object.values(result)) sets.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)) || a.weight - b.weight || a.reps - b.reps);
  return result;
}
/** Freshness uses observation time, never a snapshot's or fetch's updatedAt. */
export function freshness(e, now, timezone) {
  const day = localDay(now, timezone), time = Date.parse(now);
  if (e.freshness === 'invalid' || e.value === null || e.day > day) return 'invalid';
  if (e.observedAt === null) return 'unknown';
  if (!validInstant(e.observedAt)) return 'invalid';
  const age = time - Date.parse(e.observedAt);
  if (age < -300000) return 'invalid';
  const checkIn = ['energy', 'legs', 'symptoms', 'time_budget', 'sleep_pattern'].includes(e.metric);
  if (checkIn && (e.day !== day || localDay(e.observedAt, timezone) !== day)) return 'stale';
  if (e.metric === 'readiness' && e.day !== day) return 'stale';
  if (e.day < dayOffset(day, -1)) return 'stale';
  return age <= (checkIn ? 12 : 36) * 3600000 ? 'fresh' : 'stale';
}
/** Legacy v6 merges source fields: do not invent measured provenance or timestamps. */
export function buildContext(state, { now, timezone, observations = [], coverageKnown = false } = {}) {
  if (state?.version !== 6 || !Array.isArray(state.plan) || !Array.isArray(state.activities) || !Array.isArray(state.recovery)) throw new TypeError('Expected v6 state');
  const day = localDay(now, timezone);
  const evidence = observations.map(e => {
    if (validateSchema(evidenceSchema, e).length) throw new TypeError('Invalid observation');
    return { ...e, freshness: freshness(e, now, timezone) };
  });
  const recent = state.recovery.find(r => r.date === day);
  if (recent) for (const [metric, key] of [['energy', 'energy'], ['legs', 'legs'], ['symptoms', 'pain']]) {
    if (evidence.some(e => e.metric === metric && e.day === day)) continue;
    let value = recent[key];
    if (metric === 'symptoms') { if (value !== true) continue; value = 'unclear'; }
    else if (!finite(value) || (metric === 'energy' && value === 0)) continue;
    evidence.push({ id: `legacy-${metric}`, origin: 'self_reported', source: 'check_in', metric, value,
      observedAt: null, day, fetchedAt: null, freshness: 'unknown' });
  }
  const upcoming = state.plan.filter(p => p.date >= day && p.date <= dayOffset(day, 7))
    .slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  const selectedPlans = upcoming.slice(0, 7);
  const plans = selectedPlans.map((p, i) => ({ ref: `p${i + 1}`, date: p.date, sport: ['run', 'strength', 'cycle'].includes(p.sport) ? p.sport : 'other',
      kind: p.kind, durationMinutes: p.duration, status: p.status, locked: p.locked === true }));
  const activeIndex = selectedPlans.findIndex(p => p.id === state.active?.planId);
  const context = { schemaVersion: SCHEMA_VERSION, asOf: now, timezone, plans, evidence,
    hasActiveSession: state.active != null,
    activePlanRef: activeIndex < 0 ? null : `p${activeIndex + 1}`,
    planCoverage: { from: day, through: dayOffset(day, 7), complete: upcoming.length <= 7 },
    loadSummaries: summarizeHistory(state.activities, now, timezone, coverageKnown) };
  assertContext(context);
  return context;
}
/** Robust within-source baseline; no device mixing, no current night in baseline. */
export function recoveryTrend(observations, metric, source, now, timezone) {
  const day = localDay(now, timezone);
  const points = observations.filter(e => e.metric === metric && e.source === source && e.origin === 'measured'
    && finite(e.value) && e.value > 0 && e.day <= day && e.day >= dayOffset(day, -24)
    && e.freshness !== 'invalid' && (!e.observedAt || (validInstant(e.observedAt) && Date.parse(e.observedAt) <= Date.parse(now) + 300000)));
  // Multiple differing observations for one day are not independent baseline nights.
  const days = [...new Set(points.map(e => e.day))];
  const unique = days.flatMap(d => { const vs = [...new Set(points.filter(e => e.day === d).map(e => e.value))]; return vs.length === 1 ? [{ day: d, value: vs[0] }] : []; });
  const current = unique.filter(e => e.day >= dayOffset(day, -2));
  const base = unique.filter(e => e.day < dayOffset(day, -2) && e.day >= dayOffset(day, -23));
  const median = xs => { const values = xs.map(x => x.value).sort((a, b) => a - b), m = Math.floor(values.length / 2); return values.length % 2 ? values[m] : (values[m - 1] + values[m]) / 2; };
  return { sufficient: base.length >= 7 && current.length >= 2, baselineNights: base.length, recentNights: current.length,
    baseline: base.length >= 7 ? median(base) : null, recent: current.length >= 2 ? median(current) : null };
}

/** Calendar-week comparison is descriptive, never a safety/injury-risk score. */
export function compareWeeklyLoad(activities, now, timezone, coverageKnown = false) {
  const day = localDay(now, timezone);
  const weeks = [0, 1, 2, 3].map(offset => {
    const through = dayOffset(day, -7 * offset), from = dayOffset(through, -6);
    const subset = activities.filter(a => validInstant(a?.startedAt) && Date.parse(a.startedAt) <= Date.parse(now)
      && localDay(a.startedAt, timezone) >= from && localDay(a.startedAt, timezone) <= through);
    const w = summarizeHistory(subset, now, timezone, coverageKnown)[2];
    const totalKnownMinutes = normalizedActivities(subset).filter(a => validRpe(a.sessionRpe)).reduce((sum, a) => sum + duration(a), 0);
    // Conservative gate: exact and ambiguous duplicates must not inflate completeness.
    const usable = coverageKnown === true && w.possibleDuplicateCount === 0
      && totalKnownMinutes + w.unknownRpeMinutes > 0
      && totalKnownMinutes / (totalKnownMinutes + w.unknownRpeMinutes) >= 0.8;
    return { from, through, knownSrpeLoad: w.knownSrpeLoad, usable };
  });
  const sufficient = weeks.every(w => w.usable) && activities.every(a => validInstant(a?.startedAt) && Date.parse(a.startedAt) <= Date.parse(now) && duration(a) > 0);
  return { weeks, sufficient, precedingThreeWeekAverage: sufficient ? weeks.slice(1).reduce((s, w) => s + w.knownSrpeLoad, 0) / 3 : null };
}
