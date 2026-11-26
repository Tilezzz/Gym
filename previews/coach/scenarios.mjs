import { evaluateCoach, validateProposal } from '../../src/coach/engine.mjs';
import { SCHEMA_VERSION } from '../../src/coach/contracts.mjs';
// Synthetic clock and state only. Never read the installed PWA's storage.
export function scenario(name = 'tired') {
  const now = '2026-11-26T10:00:00Z', day = '2026-11-26';
  const values = { energy: name === 'rested' ? 4 : 2, symptoms: name === 'pain' ? 'unclear' : 'none',
    sleep_hours: name === 'rested' ? 8 : 4.75, sleep_pattern: 'single_night' };
  const context = { schemaVersion: SCHEMA_VERSION, asOf: now, timezone: 'Europe/Helsinki',
    plans: [{ ref: 'p1', date: day, sport: 'run', kind: 'run-easy', durationMinutes: 30, status: 'planned', locked: false }],
    evidence: Object.entries(values).filter(([metric]) => name !== 'missing' || metric !== 'symptoms').map(([metric, value]) => ({
      id: metric, origin: 'self_reported', source: 'check_in', metric, value, observedAt: now, day, fetchedAt: null, freshness: 'fresh' })),
    loadSummaries: [{ windowDays: 7, knownSrpeLoad: 0, knownSrpeLoadUpper: 0, unknownRpeMinutes: 0,
      runMinutes: 0, strengthSets: 0, coverageKnown: false, possibleDuplicateCount: 0 }],
    activePlanRef: null, hasActiveSession: false,
    planCoverage: { from: day, through: '2026-12-03', complete: true } };
  return context;
}
export function assess(context) { return evaluateCoach(context, context.asOf); }
// Demo-only state transition: validate again at acceptance; reject stale snapshots.
export function acceptShortening(context, proposal, snapshot) {
  if (JSON.stringify(context) !== snapshot) throw new Error('Tilanne muuttui. Pyydä uusi arvio.');
  if (proposal?.type !== 'shorten_session' || validateProposal(proposal, context, context.asOf).length)
    throw new Error('Ehdotus ei ole enää voimassa.');
  const next = structuredClone(context);
  next.plans.find(p => p.ref === proposal.planRef).durationMinutes = proposal.durationMinutes;
  return next;
}
export function decisionText(d) {
  const labels = { ease: 'Kevennä tänään', perform: 'Suunnitelman mukainen treeni sopii', rest: 'Priorisoi lepo', ask: 'Tarvitsen lisätietoja', move: 'Harkitse siirtoa' };
  const reason = d.action === 'ease' ? 'Lyhyt uni ja matala vire yhdessä puoltavat keventämistä. Yksittäinen huono yö ei yksin ratkaise päätöstä.'
    : d.action === 'perform' ? 'Annetuissa esimerkkitiedoissa ei ole yhdistettyä syytä muuttaa harjoitusta. Seuraa oloasi harjoituksen aikana.'
    : d.safety !== 'routine' ? 'Oireet on selvitettävä ennen harjoituksen muuttamista. Demo ei tee diagnooseja.' : 'Arvio vaatii lisää tietoja.';
  return [labels[d.action], reason, ...d.questions, 'Epävarmuus: ' + ({high:'suuri',moderate:'kohtalainen',low:'pieni'}[d.uncertainty]),
    'Viikon kuormitushistoria puuttuu tässä esimerkissä. Lähde: paikallinen Coach Engine; synteettinen Smart Check-in.'].join('\n\n');
}
