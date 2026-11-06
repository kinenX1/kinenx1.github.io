const CACHE='outbreak-1.0-1793993992';
const FILES=["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png", "lib/three.min.js", "lib/peerjs.min.js", "lib/CopyShader.js", "lib/EffectComposer.js", "lib/LuminosityHighPassShader.js", "lib/UnrealBloomPass.js", "lib/FXAAShader.js"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;
  const fresh=e.request.mode==='navigate'||u.pathname.endsWith('/')||u.pathname.endsWith('.html');
  if(fresh){e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request).then(h=>h||caches.match('index.html'))));return}
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}return r})))});
