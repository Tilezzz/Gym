'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
test('BR01: PWA technical identity remains unchanged',()=>{
 assert.equal(manifest.id,'./');assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
 assert.match(html,/const KEY = 'ultra-performance-v6-fresh-20261106'/);
 assert.match(html,/localStorage\.getItem\('ultra-performance-worker-url'\)/);
 assert.match(html,/indexedDB\.open\('ultra-performance-auth',1\)/);
});
test('BR02: visible brand name, About attribution and iOS title are Stride',()=>{
 assert.equal(manifest.name,'Stride');assert.equal(manifest.short_name,'Stride');
 assert.match(html,/<title>Stride 6\.5\.0/);
 assert.match(html,/apple-mobile-web-app-title" content="Stride"/);
 assert.match(html,/<strong>STRIDE<\/strong>/);
 assert.match(html,/Stride<\/strong> · by Oivallus · 6\.5\.0/);
 assert.match(html,/<img src="symbol\.svg" alt="" width="39" height="39">/);
});
test('BR03: Apple icon and PWA icons reference original supplied asset names',()=>{
 assert.match(html,/apple-touch-icon" href="icon-180\.png"/);
 assert.match(html,/rel="icon" href="icon-32\.png"/);
 assert.deepEqual(manifest.icons.map(x=>[x.src,x.sizes,x.purpose]),[['icon-192.png','192x192','any'],['icon-512.png','512x512','any']]);
 for(const [name,n] of [['icon-32.png',32],['icon-180.png',180],['icon-192.png',192],['icon-512.png',512]]){
  const b=fs.readFileSync(path.join(root,name));assert.equal(b.toString('hex',0,8),'89504e470d0a1a0a');
  assert.equal(b.readUInt32BE(16),n);assert.equal(b.readUInt32BE(20),n);
 }
 for(const name of ['symbol.svg','icon.svg'])assert.match(fs.readFileSync(path.join(root,name),'utf8'),/<svg/);
});
test('BR04: legacy migration and old saved labels stay compatible',()=>{
 assert.match(html,/Ultra Gym 5\.0 → Ultra Performance 6\.0/);
 assert.match(html,/version: 6/);
 assert.match(html,/ultra-performance-worker-session/);
});
test('BR05: SW pre-caches the new branding assets',()=>{
 for(const n of ['symbol.svg','icon.svg','icon-32.png','icon-180.png','icon-192.png','icon-512.png'])assert.ok(sw.includes("'./"+n+"'"),n);
 assert.match(sw,/CACHE_NAME='ultra-performance-v6\.5\.0-stride'/);
});
function mockSW({online=false,cacheContents={}}={}){
 const handlers={};const deleted=[];const entries=new Map(Object.entries(cacheContents));
 const fakeCache={addAll:async assets=>{fakeCache.assets=assets;},put:async(k,v)=>entries.set(k,v),match:async k=>entries.get(k)};
 const caches={open:async()=>fakeCache,keys:async()=>['ultra-performance-v6.4.1','other-app-cache','ultra-performance-v6.5.0-stride'],delete:async k=>{deleted.push(k);return true}};
 const self={location:{origin:'https://tilezzz.github.io'},registration:{scope:'https://tilezzz.github.io/Gym/'},addEventListener:(name,cb)=>handlers[name]=cb,skipWaiting:()=>{},clients:{claim:async()=>{}}};
 const Response={error:()=>({kind:'network-error'})};
 const fetch=async req=>{if(!online)throw Error('offline');return {ok:true,type:'basic',clone(){return this},kind:'online'}};
 vm.runInNewContext(sw,{self,caches,fetch,Response,URL,Promise});
 return {handlers,deleted,fakeCache};
}
test('BR06: SW activation deletes only this app’s previous cache, not other apps',async()=>{
 const {handlers,deleted}=mockSW();let task;handlers.activate({waitUntil:p=>task=p});await task;
 assert.deepEqual(deleted,['ultra-performance-v6.4.1']);
});
test('BR07: offline navigation uses cached HTML, but missing icons do not',async()=>{
 const htmlUrl='https://tilezzz.github.io/Gym/index.html';
 const {handlers}=mockSW({cacheContents:{[htmlUrl]:{kind:'cached-html'}}});
 let task;handlers.fetch({request:{method:'GET',url:'https://tilezzz.github.io/Gym/page',mode:'navigate'},respondWith:p=>task=p});
 assert.equal((await task).kind,'cached-html');
 handlers.fetch({request:{method:'GET',url:'https://tilezzz.github.io/Gym/icon-180.png',mode:'no-cors'},respondWith:p=>task=p});
 assert.equal((await task).kind,'network-error');
});
test('BR08: SW ignores requests outside /Gym/ and non-GET requests',()=>{
 const {handlers}=mockSW();let handled=false;
 for(const req of [{method:'POST',url:'https://tilezzz.github.io/Gym/'},{method:'GET',url:'https://tilezzz.github.io/other/'},{method:'GET',url:'https://example.com/Gym/'}]){
  handlers.fetch({request:req,respondWith:()=>{handled=true}});
 }
 assert.equal(handled,false);
});
