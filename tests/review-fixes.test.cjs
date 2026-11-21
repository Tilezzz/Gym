'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('P0: failed save refreshes visible state and keeps persistent backup warning',()=>{
  const source=html.slice(html.indexOf('let saveFailed = false;'),html.indexOf('function flash('));
  assert.match(html,/class="save-warning" role="alert"/);
  assert.match(html,/data-action="export">Vie JSON-varmuuskopio/);
  let canSave=false,rendered=0,alerts=0;
  const ctx={save:()=>canSave,render:()=>{rendered++},alert:()=>{alerts++},state:{active:{sets:[{id:'s1',done:true}]}}};
  vm.runInNewContext(source+';globalThis.api={commit,failed:()=>saveFailed};',ctx);
  assert.equal(ctx.api.commit(false),false);
  assert.equal(rendered,1,'Failed write must re-render even when caller requested no render');
  assert.equal(ctx.api.failed(),true);
  assert.equal(alerts,1);
  assert.equal(ctx.api.commit(false),false);
  assert.equal(rendered,2,'Warning stays visible on repeated failed writes');
  assert.equal(alerts,1,'Do not repeatedly interrupt with alerts');
  canSave=true;
  assert.equal(ctx.api.commit(false),true);
  assert.equal(ctx.api.failed(),false);
  assert.equal(rendered,3,'Successful retry clears stale warning');
});

test('P1: time budget reduces accessory sets before dropping the exercise',()=>{
  const start=html.indexOf('const __types = (() => {');
  const end=html.indexOf('const __external = (() => {');
  const ctx={localStorage:{getItem:()=>null,setItem:()=>{}},console,Date,Math,Intl,crypto:require('node:crypto').webcrypto};
  vm.runInNewContext(html.slice(start,end)+';globalThis.engine=__engine;',ctx);
  const session=ctx.engine.generate(ctx.engine.initial(),'gym-full-a',24,null);
  assert.equal(session.estimatedMinutes<=24,true);
  assert.deepEqual(Array.from(session.exercises,e=>e.id),['hack','bench','row','hamcurl']);
  assert.equal(session.exercises.at(-1).sets,1,'One accessory set fits within the budget');
  assert.equal(session.exercises[0].sets,2,'Main lift stays protected');
  assert.equal(session.exercises[1].sets,2,'Second main lift stays protected');
});

test('P1: every strength template stays within 20–60 minute budgets',()=>{
  const start=html.indexOf('const __types = (() => {');
  const end=html.indexOf('const __external = (() => {');
  const ctx={localStorage:{getItem:()=>null,setItem:()=>{}},console,Date,Math,Intl,crypto:require('node:crypto').webcrypto};
  vm.runInNewContext(html.slice(start,end)+';globalThis.api={__engine,__catalog};',ctx);
  for(const [kind,template] of Object.entries(ctx.api.__catalog.TEMPLATES)){
    if(template.sport!=='strength')continue;
    for(const minutes of [20,24,25,30,35,45,60]){
      const workout=ctx.api.__engine.generate(ctx.api.__engine.initial(),kind,minutes,null);
      assert.ok(workout.exercises.length>=2,`${kind} ${minutes} lost main lifts`);
      assert.ok(workout.estimatedMinutes<=minutes,`${kind} ${minutes}: estimated ${workout.estimatedMinutes}`);
    }
  }
});
