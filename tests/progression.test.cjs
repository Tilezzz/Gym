'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function setup(){
 const now = new Date(2026, 11, 3, 12).getTime();
 class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
 }
 const ctx={Date:TestDate,Math,Intl,console,crypto:require('node:crypto').webcrypto,localStorage:{getItem:()=>null,setItem:()=>{throw Error('Unexpected write')}}};
 const engine = html.slice(html.indexOf('const __types ='), html.indexOf('const __external ='));
 const swap = html.slice(html.indexOf('function swapExercise('), html.indexOf('function activeView('));
 vm.runInNewContext(engine + `
   const state = __engine.initial();
   const { progression } = __engine;
   const { EXERCISES } = __catalog;
   const { clamp } = __types;
   let swapOpen = false, swapSearch = '';
   const alert = message => { throw Error(message); };
   const commit = () => {};
 ` + swap + ';globalThis.api={__engine,__catalog,__types,state,swapExercise};', ctx);
 const {__engine:e,__catalog:c,__types:t,state,swapExercise}=ctx.api;
 return {e,s:state,x:c.EXERCISES.find(x=>x.id==='bench'),day:n=>t.addDays(t.today(),-n),today:t.today(),swapExercise};
}
function lift(a,ago,overrides={}){
 return {sport:'strength',date:a.day(ago),startedAt:a.day(ago)+'T10:00:00Z',sets:Array.from({length:a.x.sets},()=>({exerciseId:a.x.id,done:true,reps:a.x.max,rir:2,weight:50,...overrides}))};
}
function run(a,ago,overrides={}){
 return {sport:'run',kind:'run-long',date:a.day(ago),startedAt:a.day(ago)+'T10:00:00Z',duration:60,plannedMinutes:60,sessionRpe:5,legStress:1,sets:[],...overrides};
}
test('One good lift is not enough; two distinct days permit a bounded increase without mutation',()=>{
 const a=setup();a.s.activities=[lift(a,3)];assert.equal(a.e.progression(a.s,a.x).increase,false);
 a.s.activities.push(lift(a,7));const before=JSON.stringify(a.s);assert.equal(a.e.progression(a.s,a.x).increase,true);assert.equal(JSON.stringify(a.s),before);
});
test('Duplicate same-day sessions, missing RIR and changed loads cannot trigger increase',()=>{
 for(const mode of ['duplicate','missing','mixed']){
  const a=setup();a.s.activities=[lift(a,3),lift(a,mode==='duplicate'?3:7)];
  if(mode==='missing')a.s.activities[0].sets[0].rir=null;
  if(mode==='mixed')a.s.activities[1].sets[0].weight=45;
  assert.equal(a.e.progression(a.s,a.x).increase,false,mode);
 }
});
test('Poor current recovery suppresses strength increase and repeated failed targets explain holding',()=>{
 const a=setup();a.s.activities=[lift(a,3),lift(a,7)];a.s.recovery=[{date:a.today,energy:1}];
 assert.equal(a.e.progression(a.s,a.x).increase,false);
 a.s.recovery=[];a.s.activities=[lift(a,3,{reps:1,rir:0}),lift(a,7,{reps:1,rir:0})];
 assert.match(a.e.progression(a.s,a.x).reason,/kahdessa/);
});
test('Stale strength data does not seed old weights into a new workout',()=>{
 const a=setup();a.s.activities=[lift(a,30)];assert.equal(a.e.progression(a.s,a.x).weight,null);
 const d=a.e.startSession(a.s,'gym-full-a',60);assert.ok(d.sets.filter(s=>s.exerciseId===a.x.id).every(s=>s.weight===0));
});
test('New strength sets copy only eligible weights and reps from the same history as the suggestion', () => {
 const a = setup();
 const valid = lift(a, 3, { reps: 8, weight: '50' });
 a.s.activities = [
  lift(a, -1, { weight: 120 }),
  { ...lift(a, 1, { weight: 121 }), date: '2026-11-31' },
  { ...lift(a, 1, { weight: 122 }), startedAt: 'invalid' },
  { ...lift(a, 1, { weight: 123 }), startedAt: a.day(-1) + 'T10:00:00Z' },
  { ...lift(a, 0, { weight: 126 }), startedAt: a.today + 'T23:00:00' },
  lift(a, 1, { weight: 124, rir: null }),
  lift(a, 1, { weight: 501 }),
  lift(a, 1, { weight: 125, reps: 2.5 }),
  valid,
 ];
 const before = JSON.stringify(a.s.activities);
 assert.equal(a.e.progression(a.s, a.x).weight, 50);
 const draft = a.e.startSession(a.s, 'gym-full-a', 60);
 const bench = draft.sets.filter(s => s.exerciseId === a.x.id);
 assert.ok(bench.length >= 2);
 assert.ok(bench.every(s => s.weight === 50 && s.reps === 8));
 assert.equal(JSON.stringify(a.s.activities), before);
});
test('A bad row in an otherwise usable strength session is excluded and blocks a progression increase', () => {
 const a = setup();
 const recent = lift(a, 3);
 recent.sets.splice(1, 0, { ...recent.sets[0], weight: 120, rir: ' ' });
 a.s.activities = [recent, lift(a, 7)];
 const advice = a.e.progression(a.s, a.x);
 assert.equal(advice.weight, 50);
 assert.equal(advice.increase, false);
 const draft = a.e.startSession(a.s, 'gym-full-a', 60);
 assert.ok(draft.sets.filter(s => s.exerciseId === a.x.id).every(s => s.weight === 50));
});
test('Exercise swaps use the vetted history and never restore stale or rejected weights', () => {
 const a = setup();
 const legacy = { ...lift(a, 3, { weight: 50, reps: 8 }), source: 'legacy', startedAt: a.day(3) };
 a.s.activities = [lift(a, -1, { weight: 120 }), legacy];
 const draft = a.e.startSession(a.s, 'gym-lower', 60);
 a.swapExercise('bench');
 const swapped = draft.sets.filter(s => s.exerciseId === a.x.id);
 assert.ok(swapped.length > 0);
 assert.ok(swapped.every(s => s.weight === 50 && s.reps === 8));

 const stale = setup();
 stale.s.activities = [lift(stale, 30, { weight: 100 }), lift(stale, 1, { weight: -5 })];
 const next = stale.e.startSession(stale.s, 'gym-lower', 60);
 stale.swapExercise('bench');
 const fallback = next.sets.filter(s => s.exerciseId === stale.x.id);
 assert.ok(fallback.length > 0);
 assert.ok(fallback.every(s => s.weight === 0 && s.reps === stale.x.min));
});
test('Incomplete sets and oversized increments do not cause load increases',()=>{
 const a=setup();a.s.activities=[lift(a,3),lift(a,7)];a.s.activities[0].sets.pop();
 assert.equal(a.e.progression(a.s,a.x).increase,false);
 a.s.activities=[lift(a,3),lift(a,7)];assert.equal(a.e.progression(a.s,{...a.x,increment:20}).increase,false);
});
test('Two comparable completed long runs produce a small advisory increase without modifying state',()=>{
 const a=setup();a.s.activities=[run(a,7),run(a,14)];const before=JSON.stringify(a.s);
 const r=a.e.runningProgression(a.s,'run-long');assert.equal(r.status,'build');assert.equal(r.suggestedMinutes,63);assert.equal(r.evidence.length,2);assert.equal(JSON.stringify(a.s),before);
});
test('Generic Garmin runs are not silently classified as long or interval runs',()=>{
 const a=setup();a.s.activities=[run(a,7,{kind:'garmin-import',title:'Long Run'}),run(a,14,{kind:'garmin-import'})];
 assert.equal(a.e.runningProgression(a.s,'run-long').status,'unknown');
});
test('Missing RPE and missing target duration remain unknown/hold, not success',()=>{
 const a=setup();a.s.activities=[run(a,7,{sessionRpe:0}),run(a,14)];assert.equal(a.e.runningProgression(a.s,'run-long').status,'unknown');
 a.s.activities=[run(a,7,{plannedMinutes:null}),run(a,14)];assert.equal(a.e.runningProgression(a.s,'run-long').status,'hold');
});
test('Shortened run is not labelled fitness loss; repeated excessive effort suggests easier work',()=>{
 const a=setup();a.s.activities=[run(a,7,{duration:30}),run(a,14)];assert.equal(a.e.runningProgression(a.s,'run-long').status,'hold');
 a.s.activities=[run(a,7,{sessionRpe:9}),run(a,14,{sessionRpe:8})];assert.equal(a.e.runningProgression(a.s,'run-long').status,'ease');
});
test('Long gaps, same-day duplicates and invalid/future dates do not create progression',()=>{
 const a=setup();a.s.activities=[run(a,30),run(a,37)];assert.equal(a.e.runningProgression(a.s,'run-long').status,'return');
 a.s.activities=[run(a,7),run(a,7)];assert.equal(a.e.runningProgression(a.s,'run-long').status,'unknown');
 a.s.activities=[run(a,-7),run(a,7,{date:'invalid',startedAt:'invalid'})];assert.equal(a.e.runningProgression(a.s,'run-long').status,'unknown');
});
test('Impossible calendar dates and invalid start times cannot supply the second run', () => {
 const a = setup();
 const valid = run(a, 2);
 const invalid = [
  run(a, 3, { date: '2026-11-31' }),
  run(a, 3, { startedAt: '2026-11-31T10:00:00Z' }),
  run(a, 3, { startedAt: a.day(3) + 'T24:00:00Z' }),
  run(a, 3, { startedAt: a.day(-1) + 'T10:00:00Z' }),
 ];
 for (const exercise of invalid) {
  a.s.activities = [valid, exercise];
  const before = JSON.stringify(a.s.activities);
  const advice = a.e.runningProgression(a.s, 'run-long');
  assert.equal(advice.status, 'unknown');
  assert.equal(advice.suggestedMinutes, null);
  assert.equal(JSON.stringify(a.s.activities), before);
 }
});
test('A run counts once across dates when an ID or normalized start identifies the same workout', () => {
 const a = setup();
 const pairs = [
  [run(a, 2, { id: 'same-run' }), run(a, 3, { id: 'same-run' })],
  [run(a, 2, { source: 'garmin', externalId: 'garmin-1' }), run(a, 3, { source: 'garmin', externalId: 'garmin-1' })],
  [run(a, 2, { source: 'manual', garminExternalId: 'garmin-2' }), run(a, 3, { source: 'garmin', externalId: 'garmin-2' })],
  [run(a, 2, { source: 'oura', startedAt: '2026-12-01T01:30:00+02:00' }),
   run(a, 3, { source: 'garmin', startedAt: '2026-11-30 23:30:00' })],
 ];
 for (const pair of pairs) {
  a.s.activities = pair;
  const before = JSON.stringify(pair);
  const advice = a.e.runningProgression(a.s, 'run-long');
  assert.equal(advice.status, 'unknown');
  assert.equal(advice.suggestedMinutes, null);
  assert.equal(JSON.stringify(a.s.activities), before);
 }
});
test('Recent hard leg work and pain prevent running increase',()=>{
 const a=setup();a.s.activities=[run(a,7),run(a,14),{sport:'padel',date:a.day(1),title:'Padel',sessionRpe:8,legStress:3}];
 assert.equal(a.e.runningProgression(a.s,'run-long').status,'hold');
 a.s.activities.pop();a.s.recovery=[{date:a.today,pain:true}];assert.equal(a.e.runningProgression(a.s,'run-long').status,'hold');
});
test('Successful intervals do not increase load without interval-level execution evidence',()=>{
 const a=setup();a.s.activities=[run(a,7,{kind:'run-quality'}),run(a,14,{kind:'run-quality'})];
 const r=a.e.runningProgression(a.s,'run-quality');assert.equal(r.status,'repeat');assert.equal(r.suggestedMinutes,null);
});
