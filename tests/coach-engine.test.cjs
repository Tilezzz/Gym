'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/coach/single-poor-night.json')));
const copy = x => structuredClone(x);
const modules = Promise.all(['engine', 'context', 'contracts'].map(name => import(`../src/coach/${name}.mjs`))).then(xs => Object.assign({}, ...xs));
const now = fixture.asOf;
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
const ordinary = () => { const c = copy(fixture); c.evidence[0].value = 4; c.evidence[2].value = 8; return c; };
const activity = (extra = {}) => ({id:'a',source:'garmin',externalId:'garmin-1',sport:'run',startedAt:'2026-11-23T10:00:00Z',duration:40,sessionRpe:5,sets:[],...extra});
const state = () => ({version:6,plan:[{id:'private-id',date:'2026-11-24',sport:'run',kind:'run-easy',duration:40,status:'planned',locked:false}],activities:[],recovery:[],profile:{},active:null});
const proposal = (extra = {}) => ({type:'move_session',planRef:'p1',targetDate:'2026-11-25',durationMinutes:null,targetKind:null,...extra});

test('Coach Q01: one bad night and energy 2 leads to a reversible 20-minute suggestion', async () => {
  const api = await modules, c = frozen(copy(fixture)), before = JSON.stringify(c);
  const result = api.evaluateCoach(c, now);
  assert.equal(result.action, 'ease'); assert.equal(result.proposal.durationMinutes, 20);
  assert.deepEqual(api.validateDecision(result,c,now), []);
  assert.equal(JSON.stringify(c), before); assert.deepEqual(result, api.evaluateCoach(c, now));
});
test('Coach Q01: missing symptom information requests clarification, never assumes healthy', async () => {
  const api=await modules,c=copy(fixture); c.evidence=c.evidence.filter(e=>e.metric!=='symptoms');
  const r=api.evaluateCoach(c,now); assert.equal(r.action,'ask'); assert.equal(r.proposal,null); assert.deepEqual(r.allowedProposalTypes,[]);
});
test('Coach: a short night alone does not force rest', async()=>{
  const api=await modules,c=copy(fixture);c.evidence[0].value=4;
  assert.equal(api.evaluateCoach(c,now).action,'perform');
});
test('Coach Q02: cumulative short nights, low energy and recorded load favour rest', async()=>{
  const api=await modules,c=copy(fixture);c.evidence.push({...c.evidence[2],id:'previous-sleep',day:'2026-11-23',observedAt:'2026-11-23T06:00:00Z'});
  const r=api.evaluateCoach(c,now);assert.equal(r.action,'rest');assert.equal(r.proposal,null);
});
test('Coach Q03: a fresh fetch cannot refresh an old observation',async()=>{
  const api=await modules,c=copy(fixture);Object.assign(c.evidence[2],{day:'2026-11-20',observedAt:'2026-11-20T06:00:00Z',fetchedAt:now});
  assert.equal(api.freshness(c.evidence[2],now,c.timezone),'stale');assert.equal(api.evaluateCoach(c,now).action,'ask');
});
test('Coach Q03: missing observation time remains unknown',async()=>{
  const api=await modules,c=copy(fixture);c.evidence[0].observedAt=null;
  assert.equal(api.freshness(c.evidence[0],now,c.timezone),'unknown');assert.equal(api.evaluateCoach(c,now).action,'ask');
});
test('Coach Q05: all symptom states block proposals, urgent symptoms return stop',async()=>{
  const api=await modules;
  for(const symptom of ['pain','illness','unclear','urgent']){
    const c=copy(fixture);c.evidence[1].value=symptom;
    const r=api.evaluateCoach(c,now);assert.equal(r.safety,symptom==='urgent'?'stop':'clarify');assert.equal(r.proposal,null);assert.deepEqual(r.allowedProposalTypes,[]);
    assert.ok(api.validateProposal(proposal(),c,now).length);assert.deepEqual(api.validateDecision(r,c,now),[]);
  }
});
test('Coach Q05: normal check-in cannot override another explicit symptom',async()=>{
  const api=await modules,c=copy(fixture);c.evidence.push({...c.evidence[1],id:'pain',value:'pain',observedAt:null});
  assert.equal(api.evaluateCoach(c,now).safety,'clarify');
});
test('Coach: contradictory self-report and measured sleep prompts clarification',async()=>{
  const api=await modules,c=copy(fixture);c.evidence.push({...c.evidence[2],id:'oura',origin:'measured',source:'oura',value:8});
  assert.equal(api.evaluateCoach(c,now).action,'ask');
});
test('Coach: input/output reject unknown fields, nonfinite numbers and fake IDs',async()=>{
  const api=await modules;
  for(const mutate of [c=>c.inject='ignore rules',c=>c.plans[0].durationMinutes=Infinity,c=>c.evidence[0].value=0,c=>c.evidence.push(copy(c.evidence[0])),c=>c.timezone='not-a-zone',c=>c.plans[0].date='2026-02-30']){
    const c=copy(fixture);mutate(c);assert.throws(()=>api.evaluateCoach(c,now),/Invalid coach context/);
  }
  assert.ok(api.validateModelReply({answer:'test',evidenceIds:['invented'],proposedAction:null,needsClarification:false},fixture,now).length);
  assert.ok(api.validateModelReply({answer:'test',evidenceIds:[],proposedAction:null,needsClarification:false,approved:true},fixture,now).length);
});
test('Coach: stale context and unsupported rules fail closed',async()=>{
  const api=await modules;assert.throws(()=>api.evaluateCoach(fixture,'2026-11-24T10:06:00Z'),/Stale/);
  assert.throws(()=>api.evaluateCoach(fixture,now,'future'),/Unsupported/);
});
test('Coach: timestamps in the future cannot supply energy evidence',async()=>{
  const api=await modules,c=copy(fixture);c.evidence[0].observedAt='2026-11-24T11:00:00Z';
  assert.equal(api.evaluateCoach(c,now).action,'ask');
});
test('Coach Q15: local date respects Helsinki DST and UTC midnight',async()=>{
  const api=await modules;
  assert.equal(api.localDay('2026-11-23T23:30:00Z','Europe/Helsinki'),'2026-11-24');
  assert.equal(api.localDay('2026-03-29T00:30:00Z','Europe/Helsinki'),'2026-03-29');
  assert.equal(api.localDay('2026-03-29T01:30:00Z','Europe/Helsinki'),'2026-03-29');
});
test('Coach: short time budget recommends moving, never creates a sub-20-minute workout',async()=>{
  const api=await modules,c=ordinary();c.evidence.push({...c.evidence[0],id:'budget',metric:'time_budget',value:15});
  assert.equal(api.evaluateCoach(c,now).action,'move');assert.equal(api.evaluateCoach(c,now).proposal,null);
});
test('Coach: locked plan can receive advice but no mutation proposal',async()=>{
  const api=await modules,c=copy(fixture);c.plans[0].locked=true;
  assert.equal(api.evaluateCoach(c,now).action,'ease');assert.equal(api.evaluateCoach(c,now).proposal,null);
  assert.ok(api.validateProposal(proposal(),c,now).length);
});
test('Coach: completed plans are never selected and another future session is not authorized',async()=>{
  const api=await modules,c=ordinary();c.plans.push({...c.plans[0],ref:'p2',date:'2026-11-26'});
  assert.ok(api.validateProposal(proposal({planRef:'p2',targetDate:'2026-11-27'}),c,now).length);
  c.plans[0].status='done';assert.equal(api.evaluateCoach(c,now).action,'ask');
});
test('Coach: invalid dates, occupied days and unknown loads block a move',async()=>{
  const api=await modules,c=ordinary();assert.deepEqual(api.validateProposal(proposal(),c,now),[]);
  for(const targetDate of ['2026-11-24','2026-11-23','2026-12-03','2026-02-30',null])assert.ok(api.validateProposal(proposal({targetDate}),c,now).length);
  c.plans.push({...c.plans[0],ref:'p2',date:'2026-11-25'});assert.ok(api.validateProposal(proposal(),c,now).length);
  c.plans.pop();c.loadSummaries[0].coverageKnown=false;assert.ok(api.validateProposal(proposal(),c,now).length);
});
test('Coach: shorten, easy substitution and skip have disjoint allowed fields',async()=>{
  const api=await modules,c=ordinary();
  assert.deepEqual(api.validateProposal(proposal({type:'skip_session',targetDate:null}),c,now),[]);
  assert.ok(api.validateProposal(proposal({type:'skip_session'}),c,now).length);
  for(const durationMinutes of [19,40,41,null])assert.ok(api.validateProposal(proposal({type:'shorten_session',targetDate:null,durationMinutes}),c,now).length);
  c.plans[0].kind='run-quality';assert.deepEqual(api.validateProposal(proposal({type:'replace_with_easy',targetDate:null,targetKind:'run-easy'}),c,now),[]);
  assert.ok(api.validateProposal(proposal({type:'replace_with_easy',targetDate:null,targetKind:'gym-full-a'}),c,now).length);
});
test('Coach: model cannot replace the deterministic decision or claim approval',async()=>{
  const api=await modules,r=api.evaluateCoach(fixture,now);r.action='perform';assert.ok(api.validateDecision(r,fixture,now).length);
  const reply={answer:'Siirtoehdotus',evidenceIds:['energy'],proposedAction:proposal(),needsClarification:false};
  const before=JSON.stringify(fixture);assert.deepEqual(api.validateModelReply(reply,fixture,now),[]);assert.equal(JSON.stringify(fixture),before);
});
test('Coach Q04: same-source ID and exact cross-source workout count once in either order',async()=>{
  const api=await modules,g=activity(),o=activity({id:'b',source:'oura',externalId:'oura-2',sessionRpe:0});
  const forward=api.summarizeHistory([g,o,copy(g)],now,'Europe/Helsinki',true);
  assert.deepEqual(forward,api.summarizeHistory([o,g,copy(g)].reverse(),now,'Europe/Helsinki',true));
  assert.equal(forward[1].knownSrpeLoad,200);assert.equal(forward[1].runMinutes,40);
});
test('Coach Q04: uncertain overlap returns a load interval without editing history',async()=>{
  const api=await modules,rows=frozen([activity(),activity({id:'b',source:'oura',externalId:'oura-2',startedAt:'2026-11-23T10:05:00Z'})]);
  const w=api.summarizeHistory(rows,now,'Europe/Helsinki',true)[1];
  assert.equal(w.knownSrpeLoad,200);assert.equal(w.knownSrpeLoadUpper,400);assert.equal(w.possibleDuplicateCount,1);assert.equal(w.coverageKnown,false);assert.equal(rows.length,2);
});
test('Coach Q04: two separate sessions survive near each other',async()=>{
  const api=await modules,rows=[activity(),activity({id:'b',source:'oura',externalId:'oura-2',startedAt:'2026-11-23T10:45:00Z'})];
  assert.equal(api.summarizeHistory(rows,now,'Europe/Helsinki',true)[1].knownSrpeLoad,400);
});
test('Coach: missing and conflicting RPE are unknown minutes, not assumed easy load',async()=>{
  const api=await modules;
  const rows=[activity({sessionRpe:0})],w=api.summarizeHistory(rows,now,'Europe/Helsinki',true)[1];
  assert.equal(w.knownSrpeLoad,0);assert.equal(w.unknownRpeMinutes,40);
  const conflict=api.summarizeHistory([activity(),activity({id:'b',source:'manual',externalId:undefined,sessionRpe:8})],now,'Europe/Helsinki',true)[1];
  assert.equal(conflict.unknownRpeMinutes,40);
});
test('Coach: 48-hour window uses elapsed time, 7-day window uses local days',async()=>{
  const api=await modules,rows=[activity({startedAt:'2026-11-22T09:59:59Z'})];
  const windows=api.summarizeHistory(rows,now,'Europe/Helsinki',true);assert.equal(windows[0].runMinutes,0);assert.equal(windows[1].runMinutes,40);
});
test('Coach Q12: only completed performed exercise IDs enter strength history',async()=>{
  const api=await modules,rows=frozen([activity({source:'manual',sport:'strength',sets:[
    {exerciseId:'row',plannedExerciseId:'pullup',done:true,reps:8,weight:30,rir:2},
    {exerciseId:'pullup',done:false,reps:8,weight:99,rir:2}]})]);
  const h=api.strengthHistory(rows);assert.equal(h.row[0].weight,30);assert.equal(h.pullup,undefined);
  assert.equal(api.summarizeHistory(rows,now,'Europe/Helsinki')[1].strengthSets,1);
});
test('Coach: malformed activity timestamps cannot imply complete load coverage',async()=>{
  const api=await modules,w=api.summarizeHistory([activity({startedAt:'2026-11-23 10:00:00'})],now,'Europe/Helsinki',true)[1];
  assert.equal(w.coverageKnown,false);assert.equal(w.runMinutes,0);
});
test('Coach: legacy provenance and sample times are not invented; raw secrets and IDs stay local',async()=>{
  const api=await modules,s=state();s.recovery=[{date:'2026-11-24',energy:2,sleepHours:4.7,hrv:33,pain:false}];
  s.profile={name:'PRIVATE NAME',token:'SECRET'};s.activities=[activity({notes:'PRIVATE NOTE'})];
  const before=JSON.stringify(s),c=api.buildContext(frozen(s),{now,timezone:'Europe/Helsinki'});
  assert.deepEqual(api.validateContext(c),[]);assert.equal(c.evidence.find(e=>e.metric==='energy').freshness,'unknown');
  assert.equal(c.evidence.some(e=>e.metric==='sleep_hours'),false);
  for(const secret of ['PRIVATE','SECRET','garmin-1','private-id'])assert.equal(JSON.stringify(c).includes(secret),false);
  assert.equal(JSON.stringify(s),before);assert.equal(s.active,null);
});
test('Coach Q19: building context and preview leaves v6 state byte-for-byte unchanged',async()=>{
  const api=await modules,s=state(),before=JSON.stringify(s);
  const c=api.buildContext(frozen(s),{now,timezone:'Europe/Helsinki',observations:fixture.evidence,coverageKnown:true});
  const r=api.evaluateCoach(c,now);assert.equal(r.action,'ease');assert.equal(JSON.stringify(s),before);
});
test('Coach: recovery baseline uses unique nights and median within a single source',async()=>{
  const api=await modules,points=[];
  for(let i=3;i<=9;i++)points.push({...fixture.evidence[2],id:`h${i}`,source:'oura',origin:'measured',metric:'hrv_ms',day:`2026-11-${24-i}`,value:i===9?500:50,observedAt:null});
  for(let i=0;i<2;i++)points.push({...fixture.evidence[2],id:`r${i}`,source:'oura',origin:'measured',metric:'hrv_ms',day:`2026-11-${24-i}`,value:40,observedAt:null});
  points.push(copy(points[0]),{...points[0],id:'other',source:'garmin',value:1});
  const r=api.recoveryTrend(points,'hrv_ms','oura',now,'Europe/Helsinki');assert.equal(r.sufficient,true);assert.equal(r.baseline,50);assert.equal(r.recent,40);
  assert.equal(api.recoveryTrend(points.slice(2),'hrv_ms','oura',now,'Europe/Helsinki').sufficient,false);
});
test('Coach: generated decisions validate over energy, sleep, symptom and lock combinations',async()=>{
  const api=await modules;
  for(const energy of [1,2,3,4,5])for(const sleep of [0,4.7,8])for(const symptoms of ['none','pain','urgent'])for(const locked of [false,true]){
    const c=copy(fixture);c.evidence[0].value=energy;c.evidence[2].value=sleep;c.evidence[1].value=symptoms;c.plans[0].locked=locked;
    assert.deepEqual(api.validateDecision(api.evaluateCoach(c,now),c,now),[]);
  }
});
test('Coach: Today loads a local module and the Coach modules cannot access browser storage or network', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /import\('\.\/src\/coach\/today\.mjs'\)/);
  assert.doesNotMatch(html, /\/coach\/chat/);
  for (const name of ['today', 'engine', 'context', 'contracts']) {
    const source = fs.readFileSync(path.join(root, 'src', 'coach', `${name}.mjs`), 'utf8');
    assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(|\b(localStorage|sessionStorage|indexedDB)\b/);
  }
});
test('Coach: isolated versus repeated poor sleep must be established, not guessed',async()=>{
  const api=await modules,c=copy(fixture);c.evidence=c.evidence.filter(e=>e.metric!=='sleep_pattern');
  assert.equal(api.evaluateCoach(c,now).action,'ask');
  assert.ok(api.evaluateCoach(c,now).missingFields.includes('sleep_pattern'));
});
test('Coach: model inference cannot masquerade as a measured sleep observation',async()=>{
  const api=await modules,c=copy(fixture);Object.assign(c.evidence[2],{origin:'inferred',source:'engine'});
  assert.equal(api.evaluateCoach(c,now).action,'ask');
  Object.assign(c.evidence[2],{origin:'measured',source:'check_in'});assert.throws(()=>api.evaluateCoach(c,now),/origin/);
});
test('Coach: active sessions and incomplete schedules block modifications',async()=>{
  const api=await modules,c=ordinary();c.hasActiveSession=true;
  assert.equal(api.evaluateCoach(c,now).action,'ask');assert.ok(api.validateProposal(proposal(),c,now).length);
  c.hasActiveSession=false;c.planCoverage.complete=false;assert.ok(api.validateProposal(proposal(),c,now).includes('proposal:schedule_unknown'));
});
test('Coach: schedule truncation cannot manufacture an empty target day',async()=>{
  const api=await modules,s=state();s.plan=Array.from({length:8},(_,i)=>({...s.plan[0],id:`p${i}`}));
  const c=api.buildContext(s,{now,timezone:'Europe/Helsinki'});assert.equal(c.plans.length,7);assert.equal(c.planCoverage.complete,false);
});
test('Coach: moving adjacent to a hard run or strength session requires review',async()=>{
  const api=await modules,c=ordinary();c.plans.push({...c.plans[0],ref:'p2',date:'2026-11-26',kind:'run-quality'});
  assert.ok(api.validateProposal(proposal(),c,now).includes('proposal:adjacent_load_requires_review'));
});
test('Coach: invalid clock values and impossible dates are rejected',async()=>{
  const api=await modules;for(const instant of ['2026-11-24T24:00:00Z','2026-02-30T10:00:00Z','2026-11-24T10:60:00Z'])assert.equal(api.validInstant(instant),false);
});
test('Coach: wire object property order does not change decision validity',async()=>{
  const api=await modules,r=api.evaluateCoach(fixture,now),reordered=Object.fromEntries(Object.entries(r).reverse());
  assert.deepEqual(api.validateDecision(reordered,fixture,now),[]);
});
test('Coach: preceding three complete weeks are descriptive and missing RPE suppresses comparison',async()=>{
  const api=await modules,rows=[23,16,9,2].map((day,i)=>activity({id:`a${i}`,externalId:`g${i}`,startedAt:`2026-11-${String(day).padStart(2,'0')}T10:00:00Z`}));
  const r=api.compareWeeklyLoad(rows,now,'Europe/Helsinki',true);assert.equal(r.sufficient,true);assert.equal(r.precedingThreeWeekAverage,200);
  rows[3].sessionRpe=0;assert.equal(api.compareWeeklyLoad(rows,now,'Europe/Helsinki',true).precedingThreeWeekAverage,null);
});
test('Coach: portable JSON schemas match runtime exports',async()=>{
  const api=await modules,bundle=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/coach/contracts.schema.json'),'utf8'));
  assert.deepEqual(bundle.$defs,{context:api.contextSchema,decision:api.decisionSchema,proposal:api.proposalSchema,modelReply:api.modelReplySchema});
});
