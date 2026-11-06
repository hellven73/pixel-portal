import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createPortal} from './server.mjs';
import {verifyTicket,createBrowserServer} from './proxy.mjs';
async function harness(options={}){const app=await createPortal({dbPath:':memory:',...options});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const base=`http://127.0.0.1:${app.server.address().port}`;const request=async(path,{method='GET',data,cookie,origin=base}={})=>{const res=await fetch(base+path,{method,headers:{Origin:origin,...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});return{status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};};const register=async name=>{const result=await request('/api/auth/register',{method:'POST',data:{username:name,password:'Temporary-pass-7264!'}});assert.equal(result.status,201);return result;};return{app,base,request,register};}
test('accounts, private saves, shared chat and ownership checks',async t=>{const h=await harness();t.after(()=>h.app.close());const a=await h.register('explorer_a'),b=await h.register('explorer_b');assert.equal((await h.request('/api/auth/me',{cookie:a.cookie})).body.user.username,'explorer_a');assert.equal((await h.request('/api/chat/messages')).status,401);assert.equal((await h.request('/api/auth/login',{method:'POST',data:{username:'explorer_a',password:'wrong-password'}})).status,401);const post=await h.request('/api/chat/messages',{method:'POST',cookie:a.cookie,data:{room:'general',body:'A real shared message'}});assert.equal(post.status,201);assert.equal((await h.request('/api/chat/messages?room=general',{cookie:b.cookie})).body.messages[0].body,'A real shared message');assert.equal((await h.request(`/api/chat/messages/${post.body.id}`,{method:'DELETE',cookie:b.cookie})).status,403);assert.equal((await h.request(`/api/chat/messages/${post.body.id}`,{method:'DELETE',cookie:a.cookie})).status,200);await h.request('/api/saves',{method:'PUT',cookie:a.cookie,data:{key:'note',value:'Private note'}});assert.equal((await h.request('/api/saves',{cookie:a.cookie})).body.saves.note,'Private note');assert.equal((await h.request('/api/saves',{cookie:b.cookie})).body.saves.note,undefined);assert.equal((await h.request('/api/auth/logout',{method:'POST',cookie:a.cookie,data:{}})).status,200);assert.equal((await h.request('/api/auth/me',{cookie:a.cookie})).body.user,null);});
test('purchases are atomic; duplicate and unaffordable purchases cannot spend coins',async t=>{const h=await harness();t.after(()=>h.app.close());const a=await h.register('collector');const buy=async id=>h.request('/api/shop/buy',{method:'POST',cookie:a.cookie,data:{itemId:id}});const parallel=await Promise.all([buy('deco_foxtail'),buy('deco_foxtail')]);assert.deepEqual(parallel.map(x=>x.status).sort(),[200,409]);assert.equal((await h.request('/api/auth/me',{cookie:a.cookie})).body.user.coins,1300);assert.equal((await buy('deco_swirl')).status,200);assert.equal((await buy('deco_aurora_frame')).status,409);assert.equal((await h.request('/api/auth/me',{cookie:a.cookie})).body.user.coins,400);assert.equal((await h.request('/api/shop/equip',{method:'POST',cookie:a.cookie,data:{itemId:'deco_aurora_frame'}})).status,403);assert.equal((await h.request('/api/shop/equip',{method:'POST',cookie:a.cookie,data:{itemId:'deco_foxtail'}})).body.user.frame,'deco_foxtail');const claim=()=>h.request('/api/wallet/daily',{method:'POST',cookie:a.cookie,data:{}});assert.equal((await claim()).status,200);assert.equal((await claim()).status,409);assert.equal((await h.request('/api/auth/me',{cookie:a.cookie})).body.user.coins,450);});
test('CSRF rejection, password policy and unavailable AI are explicit',async t=>{const h=await harness();t.after(()=>h.app.close());assert.equal((await h.request('/api/auth/register',{method:'POST',data:{username:'shortpass',password:'short'}})).status,400);const a=await h.register('protected');assert.equal((await h.request('/api/wallet/daily',{method:'POST',cookie:a.cookie,origin:'https://unrelated.invalid',data:{}})).status,403);const response=await h.request('/api/ai/chat',{method:'POST',cookie:a.cookie,data:{messages:[{role:'user',content:'hello'}]}});assert.equal(response.status,503);assert.match(response.body.error,/not connected/i);const config=(await h.request('/api/config')).body;assert.equal(config.ai,false);assert.equal(config.proxy,false);assert.equal((await h.request('/api/games')).body.games.length,2603);});
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
 const ports=await fetch(h.base+'/webports.json');assert.equal(ports.status,200);const games=(await ports.json()).games;assert.equal(games.length,18);assert.equal(new Set(games.map(p=>p.url)).size,18);assert.equal(games[0].url,'https://gd-webport.pages.dev/');assert.ok(games.some(p=>p.name==='Among Us'));assert.ok(games.some(p=>p.name==='Terraria'));assert.ok(games.some(p=>p.name==='Kerbal Space Program'&&p.url==='https://ksp.ishotupa.school/'));assert.ok(games.some(p=>p.name==='Plague Inc: Evolved'&&p.url==='https://wasm.rip/files/plauge/index.html'));assert.ok(games.every(p=>/^https?:\/\//.test(p.url)||(p.local&&p.url==='./q2.html')));assert.equal((await fetch(h.base+'/community.js')).status,200);
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

test('owned HTML pages include one current Google tag at the start of head',async t=>{
 const h=await harness();t.after(()=>h.app.close());
 for(const path of ['/','/arcade/','/portal','/arcade/arcade.html','/arcade/manual.html','/arcade/terms.html','/arcade/slope.html','/arcade/browser-launch.html','/arcade/hextris.html','/not-a-real-page']){
  const response=await fetch(h.base+path,{headers:{Accept:'text/html'}});const html=await response.text();
  assert.equal(response.status,path==='/not-a-real-page'?404:200,path);
  assert.equal((html.match(/src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-6Y3DXZJTDB"/g)||[]).length,1,path);
  assert.equal((html.match(/gtag\('config', 'G-6Y3DXZJTDB'\)/g)||[]).length,1,path);
  assert.equal((html.match(/gtm\.js\?id=GTM-WR7WV87V/g)||[]).length,1,path);assert.match(html,/<head\b[^>]*>\s*<!-- Google Tag Manager -->/i,path);
  assert.ok(!html.includes('G-4QH6SB2N2D'),path);
 }
});

test('Quake II engine is local while original game data stays user-supplied',async t=>{
 const h=await harness();t.after(()=>h.app.close());
 const ports=(await(await fetch(h.base+'/webports.json')).json()).games;const q2=ports.find(g=>g.name==='Quake II');assert.equal(q2.url,'./q2.html');assert.equal(q2.local,true);assert.equal(q2.gameAssetsIncluded,false);
 assert.equal(ports.find(g=>g.id==='port-gta-vice-city-client').url,'https://joncodeofficial.github.io/gta-vice-city-wasm/');
 const html=await(await fetch(h.base+'/arcade/q2.html')).text();assert.match(html,/original game is not included/i);
 for(const file of ['index.wasm','game_baseq2.wasm','ref_soft.wasm','ref_gl1.wasm','ref_gles3.wasm']){const r=await fetch(h.base+'/arcade/'+file);assert.equal(r.status,200,file);assert.equal(r.headers.get('content-type'),'application/wasm');const bytes=await r.arrayBuffer();assert.equal(Buffer.from(bytes).subarray(0,4).toString('hex'),'0061736d');}
 for(const file of ['q2-engine.js','index.data','q2-license.txt','q2-source.tar.gz','q2-gl4es-source.tar.gz'])assert.equal((await fetch(h.base+'/arcade/'+file,{method:'HEAD'})).status,200,file);
 const script=await(await fetch(h.base+'/arcade/q2-launcher.js')).text();assert.doesNotMatch(script,/https?:\/\//);assert.match(script,/file\.arrayBuffer\(\)/);assert.doesNotMatch(script,/FormData|XMLHttpRequest|fetch\(/);
});

test('Scramjet tickets require sign-in and preserve the calling mirror origin',async t=>{
 const secret='test-only-scramjet-shared-secret-at-least-32-characters';const h=await harness({proxyOrigin:'https://proxy.example',proxySecret:secret});t.after(()=>h.app.close());
 const post=async(path,{origin=h.base,data={},cookie,token}={})=>fetch(h.base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
 assert.equal((await post('/arcade-api/browser-ticket')).status,401);
 const registered=await post('/arcade-api/auth/register',{data:{username:'scramjet_reader',password:'Test-pass-123!'}});assert.equal(registered.status,201);const cookie=registered.headers.get('set-cookie').split(';')[0];
 const native=await post('/arcade-api/browser-ticket',{cookie});assert.equal(native.status,200);const nativeData=await native.json();assert.equal(verifyTicket(nativeData.ticket,secret),true);assert.equal(JSON.parse(Buffer.from(nativeData.ticket.split('.')[0],'base64url')).origin,h.base);
 const origin='https://hellven73.github.io';const login=await post('/github-api/auth/login',{origin,data:{username:'scramjet_reader',password:'Test-pass-123!'}});assert.equal(login.status,200);const {token}=await login.json();assert.ok(token);
 const mirror=await post('/github-api/browser-ticket',{origin,token});assert.equal(mirror.status,200);const mirrorData=await mirror.json();assert.equal(verifyTicket(mirrorData.ticket,secret),true);assert.equal(JSON.parse(Buffer.from(mirrorData.ticket.split('.')[0],'base64url')).origin,origin);
 assert.equal((await post('/github-api/browser-ticket',{origin})).status,401);
});

test('Scramjet ad filtering blocks ad hosts before transport and can be disabled',async()=>{
 const {isAdRequest}=await import('./ad-filter.mjs');
 for(const url of ['https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js','https://ads.doubleclick.net/banner','https://ADNXS.COM./ad'])assert.equal(isAdRequest(url),true,url);
 for(const url of ['https://web.cloudmoonapp.com/game/com.roblox.client/','https://accounts.google.com/','https://www.youtube.com/watch?v=1','https://notdoubleclick.net/','https://doubleclick.net.example.com/','https://example.com/?next=doubleclick.net','invalid'])assert.equal(isAdRequest(url),false,url);
 const {readFile}=await import('node:fs/promises');let source=await readFile(new URL('./epoxy-adapter.mjs',import.meta.url),'utf8');
 source=source.replace("import EpoxyTransport from '/epoxy/index.mjs';","class EpoxyTransport {constructor(options){this.calls=0;} async request(){this.calls++;return {status:200,headers:[['x-test','network']],body:null}}}");
 source=source.replace("'/ad-filter.mjs'",JSON.stringify(new URL('./ad-filter.mjs',import.meta.url).href));
 const {default:Transport}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const enabled=new Transport({adblock:true});const blocked=await enabled.request(new URL('https://ads.doubleclick.net/ad'),'GET',null,{});assert.equal(blocked.status,204);assert.equal(blocked.body,null);assert.equal(enabled.calls,0);
 assert.equal((await enabled.request(new URL('https://web.cloudmoonapp.com/'),'GET',null,{})).status,200);assert.equal(enabled.calls,1);
 const disabled=new Transport({adblock:false});assert.equal((await disabled.request(new URL('https://ads.doubleclick.net/ad'),'GET',null,{})).status,200);assert.equal(disabled.calls,1);
});

test('Wisp opens dictionary-backed streams without crashing and keeps host and total caps',async()=>{
 const entry=import.meta.resolve('@mercuryworkshop/wisp-js/server');
 const {is_stream_allowed}=await import(new URL('../server/filter.mjs',entry));
 const {close_reasons,stream_types}=await import(new URL('../packet.mjs',entry));
 const proxy=createBrowserServer({secret:'regression-test-only-secret-at-least-32-characters'});
 const streams=count=>Object.fromEntries(Array.from({length:count},(_,i)=>[i+1,{socket:{hostname:'regression.invalid'}}]));
 assert.equal(await is_stream_allowed({streams:streams(1)},stream_types.TCP,'regression.invalid',443),0);
 assert.equal(await is_stream_allowed({streams:streams(12)},stream_types.TCP,'regression.invalid',443),close_reasons.ConnThrottled);
 assert.equal(await is_stream_allowed({streams:streams(32)},stream_types.TCP,'another.invalid',443),close_reasons.ConnThrottled);
 assert.equal(await is_stream_allowed({streams:{}},stream_types.TCP,'127.0.0.1',443),close_reasons.HostBlocked);
 proxy.close();
});

test('Google Tag Manager and Analytics remain singletons after repeated head injection',async()=>{
 const {withGoogleTag}=await import('./analytics.mjs');
 const supplied='<html><head><script async src="https://www.googletagmanager.com/gtm.js?id=GTM-WR7WV87V"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag(\'js\',new Date());</script></head><body></body></html>';
 const html=withGoogleTag(withGoogleTag(supplied));
 assert.equal((html.match(/gtm\.js\?id=GTM-WR7WV87V/g)||[]).length,1);
 assert.equal((html.match(/gtag\/js\?id=G-6Y3DXZJTDB/g)||[]).length,1);
 assert.equal((html.match(/gtag\('js'/g)||[]).length,1);
});
