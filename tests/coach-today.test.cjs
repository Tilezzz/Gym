'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const coach = import('../src/coach/today.mjs');

const day = '2026-11-27';
const now = `${day}T09:00:00Z`;
const timezone = 'Europe/Helsinki';
const plan = { id: 'run', date: day, kind: 'run-easy', sport: 'run', duration: 40, status: 'planned', locked: false };
const checkIn = Object.freeze({ day, observedAt: now, energy: 2, legs: 1, symptoms: 'none', sleepHours: 4.7, sleepPattern: 'single_night' });
const v6 = (changes = {}) => ({ version: 6, plan: [{ ...plan }], activities: [], recovery: [], active: null, ...changes });

async function assess(state, extra = {}) {
  const { evaluateTodayCoach } = await coach;
  return evaluateTodayCoach(state, { now, timezone, ...extra });
}

test('Today previews a validated shortening from an explicit current Smart Check-in with no state changes', async () => {
  const state = Object.freeze(v6({ plan: Object.freeze([Object.freeze({ ...plan })]),
    activities: Object.freeze([]), recovery: Object.freeze([]) }));
  const before = JSON.stringify(state);
  const result = await assess(state, { checkIn });
  assert.equal(result.decision.action, 'ease');
  assert.equal(result.proposal?.durationMinutes, 20);
  assert.equal(result.plan.durationMinutes, 40);
  assert.ok(result.decision.reasons.some(reason => reason.code === 'incomplete_load_history'));
  assert.equal(JSON.stringify(state), before);
});

test('stored recovery and stale confirmations never masquerade as a fresh symptom or sleep report', async () => {
  const state = v6({ recovery: [{ date: day, energy: 2, legs: 1, sleepHours: 4.7, pain: false }] });
  for (const observations of [undefined, { ...checkIn, day: '2026-11-26' }, { ...checkIn, observedAt: `${day}T00:00:00+02:00` }]) {
    const result = await assess(state, { now: `${day}T13:00:00Z`, checkIn: observations });
    assert.deepEqual(result.decision.missingFields, ['symptoms', 'energy']);
    assert.equal(result.proposal, null);
  }
  const noSleep = await assess(state, { checkIn: { ...checkIn, sleepHours: undefined } });
  assert.deepEqual(noSleep.decision.missingFields, ['sleep_hours']);
  const noPattern = await assess(state, { checkIn: { ...checkIn, sleepPattern: undefined } });
  assert.deepEqual(noPattern.decision.missingFields, ['sleep_pattern']);
});

test('symptoms, an active draft, locked plans and future plans cannot produce a change preview', async () => {
  const withPain = await assess(v6({ recovery: [{ date: day, pain: true }] }));
  assert.equal(withPain.decision.safety, 'clarify');
  const reportedPain = await assess(v6(), { checkIn: { ...checkIn, symptoms: 'unclear' } });
  assert.equal(reportedPain.decision.safety, 'clarify');
  const active = await assess(v6({ active: { planId: plan.id } }), { checkIn });
  const locked = await assess(v6({ plan: [{ ...plan, locked: true }] }), { checkIn });
  const future = await assess(v6({ plan: [{ ...plan, date: '2026-11-28' }] }), { checkIn });
  assert.equal(active.decision.action, 'ask');
  assert.equal(locked.plan.locked, true);
  assert.equal(future.plan, undefined);
  for (const result of [withPain, reportedPain, active, locked, future]) assert.equal(result.proposal, null);
});

test('the explicit Today budget affects only the preview and expires across local days', async () => {
  const state = v6();
  const rested = { ...checkIn, energy: 4, sleepHours: 8, sleepPattern: undefined };
  const budget = { day, observedAt: now, minutes: 15 };
  assert.equal((await assess(state, { checkIn: rested, timeBudget: budget })).decision.action, 'move');
  const old = await assess(state, { checkIn: rested, timeBudget: { ...budget, day: '2026-11-26' } });
  assert.equal(old.decision.action, 'perform');
  assert.equal(state.plan[0].duration, 40);
});
