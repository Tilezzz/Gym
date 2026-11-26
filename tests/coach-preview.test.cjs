const {test}=require('node:test');const assert=require('node:assert/strict');
const api=import('../previews/coach/scenarios.mjs');
test('Preview uses engine: fatigue shortens; symptoms and missing information block proposals',async()=>{
 const {scenario,assess}=await api;
 assert.equal(assess(scenario('tired')).proposal.durationMinutes,20);
 assert.equal(assess(scenario('rested')).action,'perform');
 for(const name of ['pain','missing']){const d=assess(scenario(name));assert.equal(d.action,'ask');assert.equal(d.proposal,null);}
});
test('Preview acceptance is immutable and cannot use a stale or tampered proposal',async()=>{
 const {scenario,assess,acceptShortening}=await api;const c=scenario(),p=assess(c).proposal,s=JSON.stringify(c);
 assert.equal(acceptShortening(c,p,s).plans[0].durationMinutes,20);assert.equal(c.plans[0].durationMinutes,30);
 c.plans[0].locked=true;assert.throws(()=>acceptShortening(c,p,s));
 assert.throws(()=>acceptShortening(scenario(),{...p,durationMinutes:1},s));
});
test('Preview never adds changes to completed activity or weight history',async()=>{
 const {scenario,assess,acceptShortening}=await api;const c=scenario();const next=acceptShortening(c,assess(c).proposal,JSON.stringify(c));
 assert.deepEqual(next.evidence,c.evidence);assert.deepEqual(next.loadSummaries,c.loadSummaries);
 assert.equal(Object.hasOwn(next,'activities'),false);assert.equal(next.plans[0].status,'planned');
});
