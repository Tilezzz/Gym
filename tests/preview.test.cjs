'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function setup() {
  let now = Date.now();
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const ctx={console,Date:TestDate,Math,Intl,crypto:require('node:crypto').webcrypto,
    localStorage:{getItem:()=>null,setItem:()=>{throw Error('Preview must not write storage');}}};
  const engine=html.slice(html.indexOf('const __types = (() => {'),html.indexOf('const __external = (() => {'));
  const view=html.slice(html.indexOf('function coachSessionProposal('),html.indexOf('function planEvent('));
  const start=html.slice(html.indexOf('function start({ session, plan })'),html.indexOf('function updateTimer('));
  vm.runInNewContext(engine+`
    const {generate,coachEvidence,coachRecommendation,getRecovery,progression,recoveryAdvice,weekStats,formatDuration,startSession}=__engine;
    const {TEMPLATES,ACTIVITIES}=__catalog;
    const {today,fiDate}=__types;
    let state=__engine.initial(),coachBudget=null,customWorkout=false,selectedKind='gym-full-a',selectedMinutes=45,previewPlanId='';
    let restUntil = 0, tab = 'today', activeModal = '';
    const events = [];
    const render = () => events.push('render');
    const notify = message => events.push(message);
    const alert = message => events.push(message);
    const commit = () => events.push('commit');
    const window = { scrollTo() {} };
    const activitySummary = () => ({ minutes: { endurance: 0 } });
    const recoveryContext = () => null;
    const bp = () => '', btn = () => '', planEvent = () => '', activityRow = () => '';
    const autoSyncEnabled = false;
    const fmt = String;
    const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const pill = v => '<span>'+esc(v)+'</span>';
  `+view+start+`;globalThis.api={engine:__engine,state,today,plannedPreview,trainSelection,previewView,todayView,
    workoutSelectionKey,startDisplayedWorkout,events,
    configure(o){if('budget' in o)coachBudget={day:today(),minutes:o.budget};if('custom' in o)customWorkout=o.custom;if(o.id)previewPlanId=o.id;}};`,ctx);
  ctx.api.setTime = date => { now = date.getTime(); };
  return ctx.api;
}
function plan(a,kind,date=a.today(),locked=false) {
  const p={id:kind+date,kind,title:kind,sport:kind.startsWith('gym')?'strength':'run',duration:60,date,status:'planned',priority:'key',locked};
  a.state.plan=[p];return p;
}
test('Preview leaves history, plan and an active workout byte-for-byte unchanged',()=>{
  const a=setup(),p=plan(a,'gym-full-a','2099-01-01');
  a.state.active={id:'existing',sets:[{done:true,weight:50}],startedAt:'2026-11-24T10:00:00Z'};
  a.configure({id:p.id});const before=JSON.stringify(a.state);
  const view=a.previewView();
  assert.match(view,/Hack-kyykky/);assert.match(view,/RIR/);assert.doesNotMatch(view,/data-action="start-plan"/);
  assert.equal(JSON.stringify(a.state),before);
});
test('Future interval preview retains planned intensity despite poor recovery today',()=>{
  const a=setup(),p=plan(a,'run-quality','2099-01-01');
  a.state.recovery=[{date:a.today(),energy:1,legs:3,sleepHours:4,pain:false}];
  const before=JSON.stringify(a.state),future=a.plannedPreview(p);
  assert.equal(future.session.kind,'run-quality');assert.ok(future.session.segments.length>1);
  assert.equal(JSON.stringify(a.state),before);
});
test('Today preview, Train selection and started session agree on recovery adjustment and budget',()=>{
  const a=setup(),p=plan(a,'run-long');
  a.state.recovery=[{date:a.today(),energy:1,legs:3,sleepHours:4,pain:false}];
  a.configure({budget:30});
  const preview=a.plannedPreview(p),choice=a.trainSelection();
  assert.equal(choice.plan.id,p.id);assert.equal(choice.kind,'run-easy');assert.equal(choice.minutes,30);
  assert.equal(JSON.stringify(choice.session),JSON.stringify(preview.session));
  a.startDisplayedWorkout(a.workoutSelectionKey(preview), choice);
  assert.equal(JSON.stringify(a.state.active.session),JSON.stringify(preview.session));
});
test('Locked future plans are previewed without changing their kind or state',()=>{
  const a=setup(),p=plan(a,'run-quality','2099-01-01',true);
  const before=JSON.stringify(a.state);assert.equal(a.plannedPreview(p).session.kind,p.kind);
  assert.equal(JSON.stringify(a.state),before);
});
test('Rest day does not select a future plan as today; explicit manual choice overrides today',()=>{
  const a=setup();plan(a,'run-long','2099-01-01');
  assert.equal(a.trainSelection().plan,null);
  plan(a,'run-quality');assert.equal(a.trainSelection().kind,'run-quality');
  a.configure({custom:true});assert.equal(a.trainSelection().plan,null);assert.equal(a.trainSelection().kind,'gym-full-a');
});
test('Preview escapes plan titles and blocks start when pain is reported',()=>{
  const a=setup(),p=plan(a,'run-quality');p.title='<img src=x onerror=alert(1)>';
  a.state.recovery=[{date:a.today(),pain:true}];a.configure({id:p.id});
  const view=a.previewView();assert.doesNotMatch(view,/<img/);assert.match(view,/&lt;img/);
  assert.match(view,/data-action="start-plan"[^>]*disabled/);
});

test('Midnight invalidates the visible start and yesterday’s budget until the new workout is confirmed', () => {
  const a = setup();
  a.setTime(new Date(2026, 10, 27, 23, 59, 59));
  const previous = plan(a, 'run-quality');
  const next = { ...previous, id: 'next', date: '2026-11-28', kind: 'run-long' };
  a.state.plan.push(next);
  a.state.activities.push({ id: 'synthetic-history' });
  a.configure({ budget: 30 });
  const shown = a.trainSelection();
  assert.equal(shown.minutes, 30);
  const before = JSON.stringify(a.state);
  a.setTime(new Date(2026, 10, 28, 0, 0, 0));
  const refreshed = a.trainSelection();
  assert.equal(refreshed.plan.id, next.id);
  assert.equal(refreshed.minutes, 60);
  a.startDisplayedWorkout(a.workoutSelectionKey(shown), refreshed);
  assert.equal(JSON.stringify(a.state), before);
  assert.equal(a.events[0], 'render');
  assert.match(a.events[1], /vahvista aloitus uudelleen/);
  a.startDisplayedWorkout(a.workoutSelectionKey(refreshed), refreshed);
  assert.equal(a.state.active.planId, next.id);
  assert.equal(a.state.active.session.kind, 'run-long');
  assert.equal(JSON.stringify(a.state.activities), '[{"id":"synthetic-history"}]');
});

test('High leg load softens Today, Preview, Train and the saved session to the same easy run', () => {
  const a = setup();
  const p = plan(a, 'run-quality');
  a.configure({ id: p.id });
  const shown = a.plannedPreview(p);
  a.state.recovery = [{ date: a.today(), energy: 3, legs: 3 }];
  assert.equal(a.engine.coachEvidence(a.state).level, 'check');
  const preview = a.plannedPreview(p);
  const selected = a.trainSelection();
  assert.equal(preview.proposal.kind, 'run-easy');
  assert.equal(preview.session.reduced, true);
  assert.match(preview.proposal.reason, /Tehoharjoitus muutettiin kevyeksi/);
  assert.ok(a.todayView().includes(`class="headline">${preview.session.title}</div>`));
  assert.ok(a.previewView().includes(`<h1 class="mt">${preview.session.title}</h1>`));
  assert.equal(a.workoutSelectionKey(preview), a.workoutSelectionKey(selected));
  a.startDisplayedWorkout(a.workoutSelectionKey(shown), selected);
  assert.equal(a.state.active, null, 'A previously rendered interval start must not start the new easy session');
  a.startDisplayedWorkout(a.workoutSelectionKey(preview), selected);
  assert.deepEqual(a.state.active.session, preview.session);
});
