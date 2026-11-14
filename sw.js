/* Ultra Performance 6.2.1 — network-first pages, offline fallback, update discovery. */
const CACHE_NAME='ultra-performance-v6.2.1';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(!url.pathname.startsWith(new URL(self.registration.scope).pathname))return;
  event.respondWith(fetch(req,{cache:'no-store'}).then(async response=>{
    if(response.ok && response.type==='basic'){
      const cache=await caches.open(CACHE_NAME);
      // Normalize cache by pathname; version query strings must not create infinite entries.
      const canonical=new URL(req.url);canonical.search='';canonical.hash='';
      await cache.put(canonical.href,response.clone());
    }
    return response;
  }).catch(async()=>{
    const cache=await caches.open(CACHE_NAME);
    const canonical=new URL(req.url);canonical.search='';canonical.hash='';
    return (await cache.match(canonical.href))||(await cache.match(new URL('./index.html',self.registration.scope).href))||Response.error();
  }));
});
