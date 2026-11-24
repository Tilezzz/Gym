'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function setup() {
  const ctx={console,Date,Math,Intl,crypto:require('node:crypto').webcrypto,
    localStorage:{getItem:()=>null,setItem:()=>{throw Error('Preview must not write storage');}}};
  const engine=html.slice(html.indexOf('const __types = (() => {'),html.indexOf('const __external = (() => {'));
  const view=html.slice(html.indexOf('function coachSessionProposal('),html.indexOf('function todayView('));
  vm.runInNewContext(engine+`
    const {generate,coachRecommendation,getRecovery,progression}=__engine;
    const {TEMPLATES,ACTIVITIES}=__catalog;
    const {today,fiDate}=__types;
    let state=__engine.initial(),coachBudget=null,customWorkout=false,selectedKind='gym-full-a',selectedMinutes=45,previewPlanId='';
    const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const pill = v => '<span>'+esc(v)+'</span>';
  `+view+`;globalThis.api={engine:__engine,state,today,plannedPreview,trainSelection,previewView,
    configure(o){if('budget' in o)coachBudget=o.budget;if('custom' in o)customWorkout=o.custom;if(o.id)previewPlanId=o.id;}};`,ctx);
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
  const draft=a.engine.startSession(a.state,choice.kind,choice.minutes,p.id);
  assert.equal(JSON.stringify(draft.session),JSON.stringify(preview.session));
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
