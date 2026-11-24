'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Load the real production engine from index.html without starting the UI or network bridge.
const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const start = html.indexOf('const __types = (() => {');
const end = html.indexOf('const __external = (() => {');
assert.ok(start > 0 && end > start, 'Expected real engine modules in index.html');
const storage = new Map();
const localStorage = {getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v))};
const context = {localStorage, console, Date, Math, Intl, crypto: require('node:crypto').webcrypto};
vm.runInNewContext(html.slice(start,end)+'\n globalThis.api={__types,__catalog,__engine,__store};',context);
const {__engine:engine,__store:store,__catalog:catalog}=context.api;
const copy=x=>JSON.parse(JSON.stringify(x));
const make=()=>copy(engine.initial());
const exercise=copy(catalog.EXERCISES.find(x=>x.venue==='gym' && x.increment>0 && x.max>x.min));
assert.ok(exercise, 'Need a weighted gym exercise fixture');
const history=(sets, date='2026-11-19T10:00:00.000Z')=>({source:'manual',sport:'strength',startedAt:date,sets:sets.map((s,i)=>({id:'s'+i,exerciseId:exercise.id,done:true,...s}))});

test('T04: invalid saved state fails closed, never overwrites it',()=>{
  storage.clear(); const key='ultra-performance-v6-fresh-20261106';storage.set(key,'{bad json');
  assert.throws(()=>store.load(),/Tallennettu harjoitusdata ei avaudu/);
  assert.equal(storage.get(key),'{bad json');
});
test('T01: version 6 state survives save/load roundtrip',()=>{
  storage.clear();const s=make();s.activities.push(history([{weight:50,reps:8,rir:2}]));
  assert.equal(store.save(s),true);
  const restored=store.load();assert.equal(restored.activities.length,1);
  assert.equal(restored.activities[0].sets[0].weight,50);
});
test('T02: active draft survives save/load',()=>{
  storage.clear();const s=make();s.active={id:'draft-1',sets:[{id:'s1',done:true}],restUntil:123};
  store.save(s);const restored=store.load();assert.equal(restored.active.id,'draft-1');
});
test('T03: save failure returns false',()=>{
  const s=make();const original=localStorage.setItem;
  localStorage.setItem=()=>{throw new Error('QuotaExceededError')};
  try{assert.equal(store.save(s),false)}finally{localStorage.setItem=original}
});
const successSets=()=>Array.from({length:exercise.sets},()=>({weight:50,reps:exercise.max,rir:2}));
const daysAgo=n=>new Date(Date.now()-n*86400000).toISOString();
const twoSuccesses=s=>{s.activities.push(history(successSets(),daysAgo(3)),history(successSets(),daysAgo(7)));};
test('T06: two complete top-range workouts trigger progression',()=>{
  const s=make();twoSuccesses(s);
  const p=engine.progression(s,exercise);assert.equal(p.increase,true);assert.equal(p.weight,50+exercise.increment);
});
test('T07: incomplete repetition range does not increase weight',()=>{
  const s=make();s.activities.push(history([{weight:50,reps:exercise.min,rir:2},{weight:50,reps:exercise.max,rir:1}]));
  assert.equal(engine.progression(s,exercise).increase,false);
});
test('T08: uncompleted sets do not affect progression after two successful workouts',()=>{
  const s=make();twoSuccesses(s);
  s.activities[0].sets.push({exerciseId:exercise.id,done:false,reps:1,rir:0,weight:50});
  assert.equal(engine.progression(s,exercise).increase,true);
});
test('T09: mixed weights must not trigger load increase',()=>{
  const s=make();s.activities.push(history([{weight:50,reps:exercise.max,rir:2},{weight:45,reps:exercise.max,rir:2}]));
  assert.equal(engine.progression(s,exercise).increase,false);
});
test('T10: new exercise must not invent starting weight',()=>{
  assert.equal(engine.progression(make(),exercise).weight,null);
});
test('T11: proposed weights never enter history before completed sets',()=>{
  const s=make();twoSuccesses(s);
  const p=engine.progression(s,exercise);assert.ok(p.increase);
  assert.equal(s.activities[0].sets[0].weight,50);
});
test('T15: finishing only persists completed work sets',()=>{
  const s=make();s.active={startedAt:new Date().toISOString(),planId:null,plannedMinutes:45,availableMinutes:45,session:{sport:'strength',kind:'gym-full-a',title:'Test',estimatedMinutes:45},sets:[{id:'done',exerciseId:exercise.id,reps:8,weight:50,rir:2,done:true},{id:'todo',exerciseId:exercise.id,reps:8,weight:50,rir:2,done:false}]};
  const a=engine.finishSession(s,{rpe:6,legs:1});assert.equal(a.sets.length,1);assert.equal(a.sets[0].id,'done');
});
test('T19: locked plan is not automatically reduced',()=>{
  const s=make();s.recovery.push({date:engine.initial().selectedDate,energy:1,legs:3,pain:false});
  const plan={locked:true};const workout=engine.generate(s,'gym-full-a',60,plan);
  assert.equal(workout.reduced,false);
});
test('T16/T17/T18: time budgets produce nonempty workouts with main lifts',()=>{
  for(const mins of [30,45,60]){
    const s=make(),workout=engine.generate(s,'gym-full-a',mins,null);
    assert.ok(workout.exercises.length>=2,`Missing main lifts at ${mins}`);
    assert.ok(workout.estimatedMinutes<=mins,`Exceeded ${mins} minutes: ${workout.estimatedMinutes}`);
  }
});
