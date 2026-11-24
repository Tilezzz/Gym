/** Wire-only contracts: never reuse the persisted v6 state as a coach payload. */
export const SCHEMA_VERSION = '1.0';
export const RULE_VERSION = '7.0.0-preview.1';
const string = (maxLength = 120) => ({ type: 'string', maxLength });
const nullable = schema => ({ ...schema, type: [schema.type, 'null'] });
const enumeration = values => ({ type: 'string', enum: values });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const array = (items, maxItems) => ({ type: 'array', items, maxItems });
const number = (minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => ({ type: 'number', minimum, maximum });
export const PROPOSAL_TYPES = ['move_session', 'shorten_session', 'replace_with_easy', 'skip_session'];
export const proposalSchema = object({
  type: enumeration(PROPOSAL_TYPES), planRef: string(), targetDate: nullable(string(10)),
  durationMinutes: nullable({ type: 'integer', minimum: 20, maximum: 240 }), targetKind: nullable(string())
});
export const evidenceSchema = object({
  id: string(), origin: enumeration(['measured', 'self_reported', 'inferred']),
  source: enumeration(['garmin', 'oura', 'check_in', 'history_summary', 'engine']),
  metric: enumeration(['sleep_hours', 'energy', 'legs', 'symptoms', 'hrv_ms', 'rest_hr_bpm', 'readiness', 'time_budget', 'sleep_pattern']),
  value: { type: ['number', 'string', 'null'], maxLength: 120 },
  observedAt: nullable(string(40)), day: string(10), fetchedAt: nullable(string(40)),
  freshness: enumeration(['fresh', 'stale', 'unknown', 'invalid'])
});
export const contextSchema = object({
  schemaVersion: { type: 'string', const: SCHEMA_VERSION }, asOf: string(40), timezone: string(80),
  activePlanRef: nullable(string()), hasActiveSession: { type: 'boolean' },
  planCoverage: object({ from: string(10), through: string(10), complete: { type: 'boolean' } }),
  plans: array(object({ ref: string(), date: string(10), sport: enumeration(['run', 'strength', 'cycle', 'other']),
    kind: string(), durationMinutes: { type: 'integer', minimum: 1, maximum: 240 },
    status: enumeration(['planned', 'done', 'adjusted', 'skipped']), locked: { type: 'boolean' } }), 7),
  evidence: array(evidenceSchema, 16),
  loadSummaries: array(object({ windowDays: { type: 'integer', enum: [2, 7, 28] },
    knownSrpeLoad: number(), knownSrpeLoadUpper: number(), unknownRpeMinutes: number(),
    runMinutes: number(), strengthSets: number(), coverageKnown: { type: 'boolean' }, possibleDuplicateCount: number() }), 3)
});
export const decisionSchema = object({
  schemaVersion: { type: 'string', const: SCHEMA_VERSION }, ruleVersion: { type: 'string', const: RULE_VERSION },
  action: enumeration(['perform', 'ease', 'move', 'rest', 'ask']), safety: enumeration(['routine', 'clarify', 'stop']),
  uncertainty: enumeration(['low', 'moderate', 'high']),
  reasons: array(object({ code: string(), evidenceIds: array(string(), 16) }), 3),
  missingFields: array(string(), 8), questions: array(string(240), 2),
  allowedProposalTypes: array(enumeration(PROPOSAL_TYPES), 4), proposal: nullable(proposalSchema)
});
export const modelReplySchema = object({ answer: string(3000), evidenceIds: array(string(), 16),
  proposedAction: nullable(proposalSchema), needsClarification: { type: 'boolean' } });

// Deliberately small, dependency-free validator for the keywords used above.
// The exported schemas are also usable by a full JSON Schema validator downstream.
export function validateSchema(schema, value, path = '$') {
  const errors = [];
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const matches = type => type === 'null' ? value === null : type === 'array' ? Array.isArray(value)
    : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
    : type === 'integer' ? Number.isSafeInteger(value)
    : type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === type;
  if (!types.some(matches)) return [`${path}:type`];
  if (value === null) return errors;
  if ('const' in schema && value !== schema.const) errors.push(`${path}:const`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}:enum`);
  if (typeof value === 'number' && (value < schema.minimum || value > schema.maximum)) errors.push(`${path}:range`);
  if (typeof value === 'string' && value.length > schema.maxLength) errors.push(`${path}:length`);
  if (Array.isArray(value)) {
    if (value.length > schema.maxItems) errors.push(`${path}:length`);
    value.forEach((item, i) => errors.push(...validateSchema(schema.items, item, `${path}[${i}]`)));
  } else if (typeof value === 'object') {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}:required`);
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties || {}, key)) errors.push(`${path}.${key}:unknown`);
      else errors.push(...validateSchema(schema.properties[key], value[key], `${path}.${key}`));
    }
  }
  return errors;
}
export function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validInstant(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60
    && validDay(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}
export function localDay(instant, timezone) {
  if (!validInstant(instant)) throw new TypeError('Invalid instant');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant));
  const get = type => parts.find(x => x.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function dayOffset(day, delta) {
  const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
export function validateContext(context) {
  const errors = validateSchema(contextSchema, context);
  if (errors.length) return errors;
  if (!validInstant(context.asOf)) errors.push('asOf:invalid');
  try { new Intl.DateTimeFormat('fi', { timeZone: context.timezone }); } catch { errors.push('timezone:invalid'); }
  for (const [name, rows, key] of [['plans', context.plans, 'ref'], ['evidence', context.evidence, 'id'], ['loadSummaries', context.loadSummaries, 'windowDays']]) {
    if (new Set(rows.map(x => x[key])).size !== rows.length) errors.push(`${name}:duplicate`);
  }
  if (!validDay(context.planCoverage.from) || !validDay(context.planCoverage.through) || context.planCoverage.from > context.planCoverage.through) errors.push('planCoverage:invalid');
  if (context.activePlanRef !== null && !context.hasActiveSession) errors.push('activePlanRef:inconsistent');
  if (context.activePlanRef !== null && !context.plans.some(p => p.ref === context.activePlanRef)) errors.push('activePlanRef:invalid');
  for (const p of context.plans) if (!p.ref || !validDay(p.date)) errors.push('plan:invalid');
  const ranges = { sleep_hours: [0, 24], energy: [1, 5], legs: [0, 3], readiness: [0, 100], hrv_ms: [0, 1000], rest_hr_bpm: [1, 300], time_budget: [0, 1440] };
  for (const e of context.evidence) {
    if (!e.id || !validDay(e.day)) errors.push('evidence:invalid');
    for (const field of ['observedAt', 'fetchedAt']) if (e[field] !== null && !validInstant(e[field])) errors.push(`evidence.${field}:invalid`);
    if (e.origin === 'measured' && !['garmin', 'oura'].includes(e.source)) errors.push('origin:invalid');
    if (e.origin === 'self_reported' && e.source !== 'check_in') errors.push('origin:invalid');
    if (e.value === null) continue;
    if (e.metric === 'sleep_pattern') {
      if (!['single_night', 'several_nights', 'unknown'].includes(e.value) || e.origin !== 'self_reported' || e.source !== 'check_in') errors.push('sleep_pattern:invalid');
      continue;
    }
    if (e.metric === 'symptoms') {
      if (!['none', 'pain', 'illness', 'unclear', 'urgent'].includes(e.value) || e.origin !== 'self_reported' || e.source !== 'check_in') errors.push('symptoms:invalid');
    } else {
      const [min, max] = ranges[e.metric];
      if (typeof e.value !== 'number' || e.value < min || e.value > max) errors.push('metric:invalid');
      if (['energy', 'legs'].includes(e.metric) && (!Number.isInteger(e.value) || e.origin !== 'self_reported' || e.source !== 'check_in')) errors.push('check_in:invalid');
    }
  }
  for (const w of context.loadSummaries) if (w.knownSrpeLoad > w.knownSrpeLoadUpper) errors.push('load:range');
  return errors;
}
export function assertContext(context) {
  const errors = validateContext(context);
  if (errors.length) throw new TypeError(`Invalid coach context: ${errors.join(', ')}`);
}
