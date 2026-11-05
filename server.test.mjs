import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createPortal} from './server.mjs';
import {verifyTicket,createBrowserServer} from './proxy.mjs';
async function harness(options={}){const app=await createPortal({dbPath:':memory:',...options});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const base=`http://127.0.0.1:${app.server.address().port}`;const request=async(path,{method='GET',data,cookie,origin=base}={})=>{const res=await fetch(base+path,{method,headers:{Origin:origin,...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});return{status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};};const register=async name=>{const result=await request('/api/auth/register',{method:'POST',data:{username:name,password:'Temporary-pass-7264!'}});assert.equal(result.status,201);return result;};return{app,base,request,register};}
test('accounts, private saves, shared chat and ownership checks',async t=>{const h=await harness();t.after(()=>h.app.close());const a=await h.register('explorer_a'),b=await h.register('explorer_b');assert.equal((await h.request('/api/auth/me',{cookie:a.cookie})).body.user.username,'explorer_a');assert.equal((await h.request('/api/chat/messages')).status,401);assert.equal((await h.request('/api/auth/login',{method:'POST',data:{username:'explorer_a',password:'wrong-password'}})).status,401);const post=await h.request('/api/chat/messages',{method:'POST',cookie:a.cookie,data:{room:'general',body:'A real shared message'}});assert.equal(post.status,201);assert.equal((await h.request('/api/chat/messages?room=general',{cookie:b.cookie})).body.messages[0].body,'A real shared message');assert.equal((await h.request(`/api/chat/messages/${post.body.id}`,{method:'DELETE',cookie:b.cookie})).status,403);assert.equal((await h.request(`/api/chat/messages/${post.body.id}`,{method:'DELETE',cookie:a.cookie})).status,200);await h.request('/api/saves',{method:'PUT',cookie:a.cookie,data:{key:'note',value:'Private note'}});assert.equal((await h.request('/api/saves',{cookie:a.cookie})).body.saves.note,'Private note');assert.equal((await h.request('/api/saves',{cookie:b.cookie})).body.saves.note,undefined);assert.equal((await h.request('/api/auth/logout',{method:'POST',cookie:a.cookie,data:{}})).status,200);assert.equal((await h.request('/api/auth/me',{cookie:a.cookie})).body.user,null);});
test('purchases are atomic; duplicate and unaffordable purchases cannot spend coins',async t=>{const h=await harness();t.after(()=>h.app.close());const a=await h.register('collector');const buy=async id=>h.request('/api/shop/buy',{method:'POST',cookie:a.cookie,data:{itemId:id}});const parallel=await Promise.all([buy('deco_foxtail'),buy('deco_foxtail')]);assert.deepEqual(parallel.map(x=>x.status).sort(),[200,409]);assert.equal((await h.request('/api/auth/me',{cookie:a.cookie})).body.user.coins,1300);assert.equal((await buy('deco_swirl')).status,200);assert.equal((await buy('deco_aurora_frame')).status,409);assert.equal((await h.request('/api/auth/me',{cookie:a.cookie})).body.user.coins,400);assert.equal((await h.request('/api/shop/equip',{method:'POST',cookie:a.cookie,data:{itemId:'deco_aurora_frame'}})).status,403);assert.equal((await h.request('/api/shop/equip',{method:'POST',cookie:a.cookie,data:{itemId:'deco_foxtail'}})).body.user.frame,'deco_foxtail');const claim=()=>h.request('/api/wallet/daily',{method:'POST',cookie:a.cookie,data:{}});assert.equal((await claim()).status,200);assert.equal((await claim()).status,409);assert.equal((await h.request('/api/auth/me',{cookie:a.cookie})).body.user.coins,450);});
test('CSRF rejection, password policy and unavailable AI are explicit',async t=>{const h=await harness();t.after(()=>h.app.close());assert.equal((await h.request('/api/auth/register',{method:'POST',data:{username:'shortpass',password:'short'}})).status,400);const a=await h.register('protected');assert.equal((await h.request('/api/wallet/daily',{method:'POST',cookie:a.cookie,origin:'https://unrelated.invalid',data:{}})).status,403);const response=await h.request('/api/ai/chat',{method:'POST',cookie:a.cookie,data:{messages:[{role:'user',content:'hello'}]}});assert.equal(response.status,503);assert.match(response.body.error,/not connected/i);const config=(await h.request('/api/config')).body;assert.equal(config.ai,false);assert.equal(config.proxy,false);assert.equal((await h.request('/api/games')).body.games.length,2625);});
test('AI forwards to configured provider; no key is exposed to the client',async t=>{let received;const h=await harness({aiBase:'https://provider.invalid/v1',aiKey:'test-key-not-a-real-credential',aiModel:'test-model',aiFetch:async(url,options)=>{received={url,options};return new Response(JSON.stringify({choices:[{message:{content:'Provider test response'}}]}),{status:200,headers:{'Content-Type':'application/json'}});}});t.after(()=>h.app.close());const a=await h.register('assistant_user');const result=await h.request('/api/ai/chat',{method:'POST',cookie:a.cookie,data:{messages:[{role:'user',content:'test question'}]}});assert.equal(result.body.reply,'Provider test response');assert.equal(received.url,'https://provider.invalid/v1/chat/completions');assert.equal(JSON.parse(received.options.body).model,'test-model');assert.equal(JSON.stringify((await h.request('/api/config')).body).includes('test-key'),false);});
test('browser tickets are short-lived and invalid tickets cannot upgrade to Wisp',async t=>{const secret='a-secure-test-value-that-is-not-used-in-production';const h=await harness({proxyOrigin:'https://browser.invalid',proxySecret:secret});t.after(()=>h.app.close());const a=await h.register('browser_user');const ticket=await h.request('/api/browser-ticket',{method:'POST',cookie:a.cookie,data:{}});assert.equal(ticket.status,200);assert.equal(verifyTicket(ticket.body.ticket,secret),true);assert.equal(verifyTicket(ticket.body.ticket+'modified',secret),false);assert.equal(verifyTicket(ticket.body.ticket,'different-secret'),false);assert.equal(verifyTicket('invalid',secret),false);const proxy=createBrowserServer({secret,portalOrigin:h.base});proxy.listen(0,'127.0.0.1');await once(proxy,'listening');t.after(()=>new Promise(resolve=>proxy.close(resolve)));const response=await fetch(`http://127.0.0.1:${proxy.address().port}/health`);assert.equal(response.status,200);const html=await (await fetch(`http://127.0.0.1:${proxy.address().port}/browser.html`)).text();assert.ok(html.includes('Pixel Browser'));assert.equal(JSON.parse(Buffer.from(ticket.body.ticket.split('.')[0],'base64url')).origin,h.base);assert.equal(html.includes('__PORTAL_ORIGIN__'),false);});

test('ticket path reaches the Wisp protocol; missing tickets are rejected', {timeout:10000}, async t=>{
 const {default:WebSocket}=await import('ws');
 const secret='another-test-only-proxy-secret-with-32-characters';
 const h=await harness({proxyOrigin:'https://browser.invalid',proxySecret:secret});t.after(()=>h.app.close());
 const account=await h.register('wisp_protocol');
 const {body:{ticket}}=await h.request('/api/browser-ticket',{method:'POST',cookie:account.cookie,data:{}});
 const proxy=createBrowserServer({secret});proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
 t.after(()=>new Promise(resolve=>proxy.close(resolve)));
 const origin=`http://127.0.0.1:${proxy.address().port}`;
 const denied=new WebSocket(origin.replace('http:','ws:')+'/wisp/',{origin});
 const deniedResult=await new Promise((resolve,reject)=>{denied.once('unexpected-response',(_,response)=>{response.resume();denied.terminate();resolve(response.statusCode);});denied.once('error',()=>{});denied.once('open',()=>reject(new Error('Unticketed connection was accepted')));});assert.equal(deniedResult,403);
 const socket=new WebSocket(origin.replace('http:','ws:')+'/wisp/'+encodeURIComponent(ticket)+'/',{origin});
 t.after(()=>socket.terminate());
 const [packet]=await once(socket,'message');assert.equal(packet[0],3,'Wisp must send the initial CONTINUE packet instead of routing to WSProxy');
 socket.close();await once(socket,'close');
});

test('public member directory paginates and profiles never expose account secrets',async t=>{
 const h=await harness();t.after(()=>h.app.close());const a=await h.register('public_alpha'),b=await h.register('public_beta'),c=await h.register('other_member');
 const page1=await h.request('/api/users?limit=2');assert.equal(page1.status,200);assert.equal(page1.body.total,3);assert.equal(page1.body.users.length,2);assert.equal(page1.body.nextCursor,b.body.user.id);
 const page2=await h.request('/api/users?limit=2&after='+page1.body.nextCursor);assert.deepEqual(page2.body.users.map(p=>p.username),['other_member']);assert.equal(page2.body.nextCursor,null);
 const search=await h.request('/api/users?search=public_');assert.equal(search.body.total,2);assert.deepEqual(search.body.users.map(p=>p.username),['public_alpha','public_beta']);assert.equal((await h.request('/api/users?search=%25')).body.total,0);
 await h.request('/api/shop/buy',{method:'POST',cookie:a.cookie,data:{itemId:'deco_foxtail'}});await h.request('/api/shop/equip',{method:'POST',cookie:a.cookie,data:{itemId:'deco_foxtail'}});
 const profile=(await h.request('/api/users/'+a.body.user.id)).body.profile;assert.equal(profile.frame,'deco_foxtail');assert.equal(profile.online,true);assert.equal(typeof profile.joinedAt,'number');
 for(const value of [...page1.body.users,profile]){assert.deepEqual(Object.keys(value).sort(),['id','username','frame','badge','nameColor','profileEffect','plusActive','joinedAt','online'].sort());}
 assert.equal((await h.request('/api/users/999999')).status,404);await h.request('/api/auth/logout',{method:'POST',cookie:a.cookie,data:{}});assert.equal((await h.request('/api/users/'+a.body.user.id)).body.profile.online,false);
 const ports=await fetch(h.base+'/webports.json');assert.equal(ports.status,200);const games=(await ports.json()).games;assert.equal(games.length,19);assert.equal(new Set(games.map(p=>p.url)).size,19);assert.equal(games[0].url,'https://gd-webport.pages.dev/');assert.ok(games.some(p=>p.name==='Among Us'));assert.ok(games.some(p=>p.name==='Terraria'));assert.ok(games.some(p=>p.name==='Kerbal Space Program'&&p.url==='https://ksp.ishotupa.school/'));assert.ok(games.some(p=>p.name==='Plague Inc: Evolved'&&p.url==='https://wasm.rip/files/plauge/index.html'));assert.ok(games.every(p=>/^https?:\/\//.test(p.url)));assert.equal((await fetch(h.base+'/community.js')).status,200);
});

test('custom-domain origin allowlist permits the owned hosts and rejects other sites',async t=>{
 const h=await harness({origins:'https://pixelarcade.com.au,https://www.pixelarcade.com.au,https://hellven73-pixel-portal.onrender.com'});t.after(()=>h.app.close());
 const account=await h.request('/api/auth/register',{method:'POST',origin:'https://pixelarcade.com.au',data:{username:'domain_member',password:'Temporary-domain-pass-7264!'}});assert.equal(account.status,201);
 assert.equal((await h.request('/api/wallet/daily',{method:'POST',cookie:account.cookie,origin:'https://www.pixelarcade.com.au',data:{}})).status,200);
 assert.equal((await h.request('/api/chat/messages',{method:'POST',cookie:account.cookie,origin:'https://unrelated.invalid',data:{body:'must not be sent'}})).status,403);
});

test('bad page links render a branded 404 but API responses remain JSON',async t=>{
 const h=await harness();t.after(()=>h.app.close());
 for(const path of ['/isuafhdsuf','/arcade/does-not-exist.html']){
  const response=await fetch(h.base+path,{headers:{Accept:'text/html'}});
  assert.equal(response.status,404);
  assert.match(response.headers.get('content-type'),/text\/html/);
  assert.equal(response.headers.get('x-robots-tag'),'noindex');
  const html=await response.text();
  assert.match(html,/404/);
  assert.match(html,/Back to Arcade/);
 }
 const head=await fetch(h.base+'/random-link',{method:'HEAD',headers:{Accept:'text/html'}});
 assert.equal(head.status,404);
 assert.equal(await head.text(),'');
 const api=await fetch(h.base+'/api/not-a-real-endpoint',{headers:{Accept:'text/html'}});
 assert.equal(api.status,404);
 assert.match(api.headers.get('content-type'),/application\/json/);
 assert.equal((await api.json()).error,'Unknown endpoint.');
});

test('arcade homepage includes a loading intro on every full navigation with skip and assets',async t=>{
 const h=await harness();t.after(()=>h.app.close());
 const response=await fetch(h.base+'/');
 assert.equal(response.status,200);
 const html=await response.text();
 assert.match(html,/pixel-launch-loader/);
 assert.match(html,/pixel-loading-enabled/);
 assert.match(html,/pixel-launch-progress/);
 assert.match(html,/window.addEventListener/);
 assert.doesNotMatch(html,/pixel-loader-session-v1/);
 for(const asset of ['/loading-screen.js','/loading-screen.css']){
  const res=await fetch(h.base+asset);
  assert.equal(res.status,200);
  assert.ok((await res.text()).includes('pixel-launch-'));
 }
 assert.equal((await fetch(h.base+'/portal')).status,200);
});

test('reserved administrator username cannot be claimed via public registration',async t=>{
 const h=await harness({adminUsername:'archangel'});t.after(()=>h.app.close());
 const res=await fetch(h.base+'/arcade-api/auth/register',{
  method:'POST',headers:{Origin:h.base,'Content-Type':'application/json'},
  body:JSON.stringify({username:'archangel',password:'A-strong-unique-passphrase-123'})
 });
 assert.equal(res.status,403);
 assert.match((await res.json()).error,/administrator registration/i);
});

test('account writes wait for durable storage acknowledgement',{timeout:5000},async t=>{
 let release,updates=0,reached;const storageReached=new Promise(resolve=>{reached=resolve});
 const cloud={
  snapshots:{portal:null,arcade:null},
  flushIfChanged:()=>{updates++;if(updates===2)return new Promise(resolve=>{release=resolve;reached()});return Promise.resolve()},
  close:async()=>{}
 };
 const h=await harness({cloudSnapshots:cloud});t.after(()=>h.app.close());
 const pending=fetch(h.base+'/api/auth/register',{
  method:'POST',headers:{Origin:h.base,'Content-Type':'application/json'},
  body:JSON.stringify({username:'durable_member',password:'Secure-password-for-testing'})
 });
 await storageReached;
 assert.equal(typeof release,'function');
 release();
 const response=await pending;
 assert.equal(response.status,201);
 assert.equal((await response.json()).user.username,'durable_member');
});

test('homepage exposes embedded Webported Games without provider links',async t=>{
 const h=await harness();t.after(()=>h.app.close());
 const html=await fetch(h.base+'/');
 assert.equal(html.status,200);
 const body=await html.text();
 assert.match(body,/webports-home\.js\?v=4/);
 assert.match(body,/webports-home\.css\?v=2/);
 const scripts=await fetch(h.base+'/webports-home.js');
 assert.equal(scripts.status,200);
 const js=await scripts.text();
 assert.match(js,/px-webports-page/);
 assert.match(js,/px-webport-theater/);
 assert.doesNotMatch(js,/Open directly|Open separately|Community port hosted by/);
 const styles=await fetch(h.base+'/webports-home.css');
 assert.equal(styles.status,200);
 assert.match(await styles.text(),/px-webport-theater/);
});

test('all Arcade URLs resolve bundled JavaScript and CSS from /arcade/',async t=>{
 const h=await harness();t.after(()=>h.app.close());
 for(const path of ['/','/arcade','/arcade/']){
  const response=await fetch(h.base+path);
  assert.equal(response.status,200);
  const html=await response.text();
  const baseMatch=html.match(/<base href="([^"]+)"/);
  assert.ok(baseMatch,path+' must explicitly set base href for bundled assets');
  const base=new URL(baseMatch[1],h.base+path);
  assert.equal(base.pathname,'/arcade/');
  assert.match(html,/webports-home\.js\?v=4/);
  for(const asset of ['extras.js','hub.js','api-client.js','community.js','style.css']){
   const assetResponse=await fetch(new URL(asset,base));
   assert.equal(assetResponse.status,200,path+' should load '+asset);
   assert.match(assetResponse.headers.get('content-type')||'',asset.endsWith('.css')?/text\/css/:/javascript/);
  }
 }
});
