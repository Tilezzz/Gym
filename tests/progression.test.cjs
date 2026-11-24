'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function setup(){
 const ctx={Date,Math,Intl,console,crypto:require('node:crypto').webcrypto,localStorage:{getItem:()=>null,setItem:()=>{throw Error('Unexpected write')}}};
 vm.runInNewContext(html.slice(html.indexOf('const __types ='),html.indexOf('const __external ='))+';globalThis.api={__engine,__catalog,__types};',ctx);
 const {__engine:e,__catalog:c,__types:t}=ctx.api;return {e,s:e.initial(),x:c.EXERCISES.find(x=>x.id==='bench'),day:n=>t.addDays(t.today(),-n),today:t.today()};
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
test('Recent hard leg work and pain prevent running increase',()=>{
 const a=setup();a.s.activities=[run(a,7),run(a,14),{sport:'padel',date:a.day(1),title:'Padel',sessionRpe:8,legStress:3}];
 assert.equal(a.e.runningProgression(a.s,'run-long').status,'hold');
 a.s.activities.pop();a.s.recovery=[{date:a.today,pain:true}];assert.equal(a.e.runningProgression(a.s,'run-long').status,'hold');
});
test('Successful intervals do not increase load without interval-level execution evidence',()=>{
 const a=setup();a.s.activities=[run(a,7,{kind:'run-quality'}),run(a,14,{kind:'run-quality'})];
 const r=a.e.runningProgression(a.s,'run-quality');assert.equal(r.status,'repeat');assert.equal(r.suggestedMinutes,null);
});
