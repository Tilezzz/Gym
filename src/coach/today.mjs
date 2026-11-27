import { buildContext } from './context.mjs';
import { localDay } from './contracts.mjs';
import { evaluateCoach, validateProposal } from './engine.mjs';

/** View data only. Check-in confirmations never become part of persisted v6 state. */
export function evaluateTodayCoach(state, { now, timezone, checkIn, timeBudget }) {
  const day = localDay(now, timezone);
  const observations = [];
  function add(metric, value, observedAt) {
    if (value == null) return;
    observations.push({ id: `today-${metric}`, metric, value, origin: 'self_reported',
      source: 'check_in', day, observedAt, fetchedAt: null, freshness: 'unknown' });
  }
  if (checkIn?.day === day) {
    add('energy', checkIn.energy, checkIn.observedAt);
    add('legs', checkIn.legs, checkIn.observedAt);
    add('symptoms', checkIn.symptoms, checkIn.observedAt);
    add('sleep_hours', checkIn.sleepHours, checkIn.observedAt);
    add('sleep_pattern', checkIn.sleepPattern, checkIn.observedAt);
  }
  if (timeBudget?.day === day) {
    add('time_budget', timeBudget.minutes, timeBudget.observedAt);
  }
  const context = buildContext(state, { now, timezone, observations });
  const decision = evaluateCoach(context, now);
  const plan = context.plans.find(p => p.date === day && p.status === 'planned');
  const proposal = decision.proposal && validateProposal(decision.proposal, context, now).length === 0
    ? decision.proposal
    : null;
  return { decision, plan, proposal, observations: context.evidence.filter(e => e.freshness === 'fresh') };
}
