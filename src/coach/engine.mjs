import { RULE_VERSION, SCHEMA_VERSION, assertContext, decisionSchema, proposalSchema, modelReplySchema, validateSchema, localDay, dayOffset, validDay } from './contracts.mjs';
import { freshness } from './context.mjs';
const easyKinds = { 'run-quality': 'run-easy', 'cycle-quality': 'cycle-easy' };
function proposalTypes(plan) {
  if (!plan || plan.status !== 'planned' || plan.locked) return [];
  return ['move_session', ...(plan.durationMinutes > 20 ? ['shorten_session'] : []),
    ...(easyKinds[plan.kind] ? ['replace_with_easy'] : []), 'skip_session'];
}
export function evaluateCoach(context, now, ruleVersion = RULE_VERSION) {
  assertContext(context);
  if (ruleVersion !== RULE_VERSION) throw new TypeError('Unsupported rule version');
  const day = localDay(now, context.timezone);
  if (Math.abs(Date.parse(now) - Date.parse(context.asOf)) > 300000) throw new TypeError('Stale context');
  const today = context.evidence.filter(e => e.day === day);
  const fresh = context.evidence.filter(e => e.origin !== 'inferred' && freshness(e, now, context.timezone) === 'fresh');
  const get = metric => fresh.filter(e => e.metric === metric).sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)) || a.id.localeCompare(b.id))[0];
  const plan = context.plans.find(p => p.date === day && p.status === 'planned');
  const out = { schemaVersion: SCHEMA_VERSION, ruleVersion, action: 'ask', safety: 'routine', uncertainty: 'moderate',
    reasons: [], missingFields: [], questions: [], allowedProposalTypes: [], proposal: null };
  const reason = (code, es = []) => out.reasons.push({ code, evidenceIds: es.map(e => e.id) });
  // An explicit symptom cannot be cancelled by a later normal reading or stale label.
  const symptom = today.find(e => e.metric === 'symptoms' && e.value === 'urgent')
    || today.find(e => e.metric === 'symptoms' && e.value !== null && e.value !== 'none');
  if (symptom) {
    out.safety = symptom.value === 'urgent' ? 'stop' : 'clarify';
    out.action = out.safety === 'stop' ? 'rest' : 'ask'; out.uncertainty = 'high';
    reason(out.safety === 'stop' ? 'urgent_symptom' : 'clarify_symptoms', [symptom]);
    if (out.action === 'ask') out.questions.push('Millainen oire on kyseessä ja onko se edelleen läsnä?');
    return out;
  }
  const energy = get('energy'), symptoms = get('symptoms'), legs = get('legs'), sleep = get('sleep_hours'), budget = get('time_budget');
  const pattern = get('sleep_pattern');
  const conflicts = ['energy', 'sleep_hours', 'symptoms'].filter(metric => {
    const relevant = fresh.filter(e => e.metric === metric && e.day === (get(metric)?.day));
    return new Set(relevant.map(e => e.value)).size > 1;
  });
  if (conflicts.length) {
    out.uncertainty = 'high'; out.missingFields = conflicts; reason('conflicting_observations');
    out.questions.push('Tiedoissa on ristiriita. Vahvistatko tämänhetkisen olosi ja viime yön unen?'); return out;
  }
  if (!symptoms) { out.missingFields.push('symptoms'); out.questions.push('Onko sinulla kipua tai sairausoireita?'); }
  if (!energy) { out.missingFields.push('energy'); out.questions.push('Millainen tämänhetkinen vireesi on asteikolla 1–5?'); }
  if (out.questions.length) { out.uncertainty = 'high'; reason('missing_check_in'); return out; }
  if (!plan || context.hasActiveSession || plan.ref === context.activePlanRef) { out.missingFields.push('plan'); out.questions.push('Mitä harjoitusta haluat arvioida?'); reason('no_today_plan'); return out; }
  const shortNights = [...new Set(context.evidence.filter(e => e.metric === 'sleep_hours' && typeof e.value === 'number' && e.value < 5.5
    && e.origin !== 'inferred' && e.day >= dayOffset(day, -2) && e.day <= day && e.freshness !== 'invalid'
    && e.observedAt && Date.parse(e.observedAt) <= Date.parse(now) + 300000).map(e => e.day))];
  const week = context.loadSummaries.find(w => w.windowDays === 7);
  const loadUncertain = !week?.coverageKnown || week.unknownRpeMinutes > 0 || week.possibleDuplicateCount > 0;
  if (energy.value <= 2 && !sleep && (!legs || legs.value < 3)) {
    out.missingFields.push('sleep_hours'); out.questions.push('Miten nukuit viime yönä, ja onko väsymys jatkunut useamman päivän?');
    out.uncertainty = 'high'; reason('low_energy_missing_context', [energy]); return out;
  }
  if (energy.value <= 2 && sleep?.value < 5.5 && shortNights.length < 2 && pattern?.value !== 'single_night' && pattern?.value !== 'several_nights') {
    out.missingFields.push('sleep_pattern'); out.questions.push('Oliko tämä yksittäinen huono yö vai onko huono uni jatkunut?');
    out.uncertainty = 'high'; reason('clarify_sleep_pattern', [energy, sleep]); return out;
  }
  out.allowedProposalTypes = proposalTypes(plan);
  if (energy.value === 1 || (energy.value <= 2 && (shortNights.length >= 2 || pattern?.value === 'several_nights') && week?.knownSrpeLoad > 0)) {
    out.action = 'rest'; reason('accumulated_fatigue_or_very_low_energy', [energy]);
  } else if (budget && budget.value < 20) {
    out.action = 'move'; reason('insufficient_time', [budget]);
  } else if ((energy.value <= 2 && (sleep?.value < 5.5 || legs?.value >= 3)) || (budget && budget.value < plan.durationMinutes)) {
    out.action = 'ease'; reason('combined_fatigue_or_time_constraint', [energy, ...(sleep ? [sleep] : []), ...(budget ? [budget] : [])]);
    if (out.allowedProposalTypes.includes('shorten_session')) out.proposal = { type: 'shorten_session', planRef: plan.ref,
      durationMinutes: Math.max(20, Math.min(Math.floor(plan.durationMinutes / 2), Math.floor(budget?.value ?? plan.durationMinutes))), targetDate: null, targetKind: null };
    else if (out.allowedProposalTypes.includes('replace_with_easy')) out.proposal = { type: 'replace_with_easy', planRef: plan.ref,
      durationMinutes: null, targetDate: null, targetKind: easyKinds[plan.kind] };
  } else if (energy.value <= 2 || legs?.value >= 3 || shortNights.length >= 2) {
    out.action = 'ask'; out.questions.push('Onko kuormitus tai väsymys tavallista suurempaa tänään?');
    out.allowedProposalTypes = []; reason('clarify_fatigue', [energy]);
  } else {
    out.action = 'perform'; reason('no_combined_reason_to_adjust', [energy, symptoms]);
  }
  if (loadUncertain) { out.uncertainty = 'high'; reason('incomplete_load_history'); }
  return out;
}
/** Validates proposals; it deliberately cannot apply them or imply approval. */
export function validateProposal(proposal, context, now) {
  const errors = validateSchema(proposalSchema, proposal);
  if (errors.length) return errors;
  const decision = evaluateCoach(context, now);
  if (decision.safety !== 'routine' || decision.action === 'ask' || !decision.allowedProposalTypes.includes(proposal.type)) errors.push('proposal:not_allowed');
  const day = localDay(now, context.timezone), plan = context.plans.find(p => p.ref === proposal.planRef);
  if (!plan || context.hasActiveSession || plan.ref === context.activePlanRef || plan.date < day || plan.status !== 'planned' || plan.locked) return [...errors, 'proposal:plan_unavailable'];
  // A daily decision cannot authorize a proposal for another, unassessed session.
  if (plan !== context.plans.find(p => p.date === day && p.status === 'planned')) errors.push('proposal:unassessed_plan');
  if (proposal.type === 'move_session') {
    if (!validDay(proposal.targetDate) || proposal.targetDate <= day || proposal.targetDate > dayOffset(day, 7)) errors.push('proposal:date');
    if (!context.planCoverage.complete || context.planCoverage.from > day || context.planCoverage.through < proposal.targetDate) errors.push('proposal:schedule_unknown');
    if (context.plans.some(p => p.ref !== plan.ref && p.date === proposal.targetDate && p.status !== 'skipped')) errors.push('proposal:day_occupied');
    if (validDay(proposal.targetDate) && context.plans.some(p => p.ref !== plan.ref && p.status === 'planned'
      && Math.abs(Date.parse(p.date) - Date.parse(proposal.targetDate)) <= 86400000
      && (p.sport === 'strength' || /quality|long/.test(p.kind)))) errors.push('proposal:adjacent_load_requires_review');
    if (proposal.durationMinutes !== null || proposal.targetKind !== null) errors.push('proposal:irrelevant_fields');
    if (!context.loadSummaries.find(w => w.windowDays === 7 && w.coverageKnown && w.unknownRpeMinutes === 0 && w.possibleDuplicateCount === 0)) errors.push('proposal:load_unknown');
  } else if (proposal.type === 'shorten_session') {
    if (!Number.isInteger(proposal.durationMinutes) || proposal.durationMinutes < 20 || proposal.durationMinutes >= plan.durationMinutes) errors.push('proposal:duration');
    if (proposal.targetDate !== null || proposal.targetKind !== null) errors.push('proposal:irrelevant_fields');
  } else if (proposal.type === 'replace_with_easy') {
    if (!easyKinds[plan.kind] || proposal.targetKind !== easyKinds[plan.kind]) errors.push('proposal:kind');
    if (proposal.targetDate !== null || proposal.durationMinutes !== null) errors.push('proposal:irrelevant_fields');
  } else if (proposal.targetDate !== null || proposal.durationMinutes !== null || proposal.targetKind !== null) errors.push('proposal:irrelevant_fields');
  return errors;
}
export function validateDecision(decision, context, now) {
  const errors = validateSchema(decisionSchema, decision);
  if (errors.length) return errors;
  const expected = evaluateCoach(context, now);
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  if (JSON.stringify(canonical(decision)) !== JSON.stringify(canonical(expected))) errors.push('decision:does_not_match_engine');
  if (decision.proposal) errors.push(...validateProposal(decision.proposal, context, now));
  return errors;
}
export function validateModelReply(reply, context, now) {
  const errors = validateSchema(modelReplySchema, reply);
  if (errors.length) return errors;
  if (reply.evidenceIds.some(id => !context.evidence.some(e => e.id === id))) errors.push('reply:unknown_evidence');
  if (reply.proposedAction) errors.push(...validateProposal(reply.proposedAction, context, now));
  return errors;
}
