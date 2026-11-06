importScripts('/scram/scramjet.all.js');
const {ScramjetServiceWorker}=$scramjetLoadWorker();
const scramjet=new ScramjetServiceWorker();
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>event.respondWith((async()=>{const path=new URL(event.request.url).pathname;try{if(path.startsWith('/service/')&&new URL(decodeURIComponent(path.slice(9))).hostname.toLowerCase().replace(/\.$/,'')==='accounts.google.com')return new Response('<!doctype html><meta charset="utf-8"><title>Google sign-in unavailable</title><h1>Google sign-in needs the official service</h1><p>This proxy does not load Google account or password pages. Close this window and start sign-in on the game service’s official website in a normal browser window. Its session may not transfer back here. Do not bypass browser security warnings.</p>',{status:409,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});}catch{}await scramjet.loadConfig();return scramjet.route(event)?scramjet.fetch(event):fetch(event.request);})()));
