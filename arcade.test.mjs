import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPortal} from './server.mjs';
async function harness(t,options={}){
 const app=await createPortal({dbPath:':memory:',adminUsername:'owner_test',...options});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(()=>app.close());
 const base=`http://127.0.0.1:${app.server.address().port}`;
 async function request(path,{data,cookie,method=data?'POST':'GET',origin=base}={}){const r=await fetch(base+'/arcade-api/'+path,{method,headers:{Origin:origin,...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],setCookie:r.headers.get('set-cookie')};}
 async function register(username){const r=await request('auth/register',{data:{username,password:'Test-passphrase-3456!'}});assert.equal(r.status,201,JSON.stringify(r.data));assert.ok(!('token' in r.data));return r;}
 return{app,base,request,register};
}
test('Arcade chat memberships, all-user sidebar, edits, custom moderators and admin boundaries',async t=>{
 const h=await harness(t),owner=await h.register('owner_test'),a=await h.register('alice_test'),b=await h.register('bob_test');
 const room='pixel-public-lobby',channel='pixel-public-general';
 let result=await h.request('chat?server='+room+'&channel='+channel,{cookie:a.cookie});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.members.length,3);assert.ok(result.data.members.some(x=>x.username==='bob_test'));
 assert.equal((await h.request('roles',{cookie:a.cookie})).status,403);
 result=await h.request('roles',{cookie:owner.cookie,data:{action:'create',name:'Helper',color:'#aabbcc',position:10,moderate:true}});assert.equal(result.status,200,JSON.stringify(result.data));const role=result.data.id;
 assert.equal((await h.request('roles',{cookie:owner.cookie,data:{action:'assign',id:role,username:'bob_test'}})).status,200);
 const chat=await h.request('chat',{cookie:a.cookie,data:{action:'send',server:room,channel,body:'Shared test message'}});assert.equal(chat.status,200,JSON.stringify(chat.data));
 let messages=(await h.request('chat?server='+room+'&channel='+channel,{cookie:a.cookie})).data.messages;const id=messages[0].id;
 assert.equal((await h.request('chat',{cookie:b.cookie,data:{action:'edit',server:room,channel,message:id,body:'Not my message'}})).status,403);
 assert.equal((await h.request('chat',{cookie:a.cookie,data:{action:'edit',server:room,channel,message:id,body:'Edited'}})).status,200);
 assert.equal((await h.request('chat',{cookie:b.cookie,data:{action:'react',server:room,channel,message:id,emoji:'👍'}})).status,200);
 assert.equal((await h.request('moderation',{cookie:b.cookie,data:{action:'delete-message',id}})).status,200);
 assert.equal((await h.request('admin',{cookie:b.cookie})).status,403);
 assert.equal((await h.request('roles',{cookie:b.cookie,data:{action:'assign',id:role,username:'alice_test'}})).status,403);
 assert.equal((await h.request('moderation',{cookie:b.cookie,data:{action:'restrict',username:'alice_test',minutes:10,banned:false,reason:'test'}})).status,403);
 const privateRoom=await h.request('chat',{cookie:a.cookie,data:{action:'create',name:'Private test'}});assert.equal(privateRoom.status,200);
 assert.equal((await h.request('chat?server='+privateRoom.data.server,{cookie:b.cookie})).status,403);
 assert.equal((await h.request('chat',{cookie:a.cookie,origin:'https://unrelated.invalid',data:{action:'send',server:room,channel,body:'forbidden'}})).status,403);
 const admin=await h.request('admin',{cookie:owner.cookie});assert.equal(admin.status,200);assert.equal(JSON.stringify(admin.data).includes('password_hash'),false);
});
test('friend acceptance gates DMs, strangers cannot read, blocking revokes messaging',async t=>{
 const h=await harness(t),a=await h.register('friend_a'),b=await h.register('friend_b'),c=await h.register('stranger_c');
 assert.equal((await h.request('social',{cookie:a.cookie,data:{action:'dm',username:'friend_b',body:'too soon'}})).status,403);
 assert.equal((await h.request('social',{cookie:a.cookie,data:{action:'request',username:'friend_b'}})).status,200);
 assert.equal((await h.request('social',{cookie:b.cookie,data:{action:'accept',username:'friend_a'}})).status,200);
 assert.equal((await h.request('social',{cookie:a.cookie,data:{action:'dm',username:'friend_b',body:'Private message'}})).status,200);
 assert.equal((await h.request('social?with=friend_a',{cookie:b.cookie})).data.messages[0].body,'Private message');
 assert.equal((await h.request('social?with=friend_a',{cookie:c.cookie})).status,403);
 assert.equal((await h.request('social',{cookie:b.cookie,data:{action:'block',username:'friend_a'}})).status,200);
 assert.equal((await h.request('social?with=friend_a',{cookie:b.cookie})).status,403);
 assert.equal((await h.request('social',{cookie:a.cookie,data:{action:'dm',username:'friend_b',body:'blocked'}})).status,403);
});
test('market batches roll back purchases and gifts; audited admin grant replay is safe',async t=>{
 const h=await harness(t),o=await h.register('owner_test'),a=await h.register('buyer_a'),b=await h.register('buyer_b');
 let market=(await h.request('marketplace',{cookie:a.cookie})).data;assert.equal(market.coins,100);
 const expensive=market.catalog.find(x=>x.price>market.coins);
 assert.equal((await h.request('marketplace',{cookie:a.cookie,data:{action:'buy',item:expensive.id}})).status,409);
 assert.equal(h.app.arcade.db.prepare('SELECT COUNT(*) AS n FROM market_inventory').get().n,0);
 const grant={username:'buyer_a',amount:5000,reason:'Integration verification',requestId:crypto.randomUUID()};
 assert.equal((await h.request('admin/coins',{cookie:a.cookie,data:grant})).status,403);
 assert.equal((await h.request('admin/coins',{cookie:o.cookie,data:grant})).status,200);
 const replay=await h.request('admin/coins',{cookie:o.cookie,data:grant});assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);
 assert.equal((await h.request('marketplace',{cookie:a.cookie})).data.coins,5100);
 const purchased=await h.request('marketplace',{cookie:a.cookie,data:{action:'buy',item:expensive.id}});assert.equal(purchased.status,200);const balance=purchased.data.coins;
 assert.equal((await h.request('marketplace',{cookie:a.cookie,data:{action:'buy',item:expensive.id}})).status,409);
 assert.equal((await h.request('marketplace',{cookie:a.cookie})).data.coins,balance);
 assert.equal((await h.request('marketplace',{cookie:a.cookie,data:{action:'gift',username:'buyer_b',amount:10000,requestId:crypto.randomUUID()}})).status,409);
 assert.equal((await h.request('marketplace',{cookie:a.cookie})).data.coins,balance);
});
test('retired generated games cannot be reached through APIs or direct asset URLs',async t=>{
 const h=await harness(t);
 for(const path of ['party','challenges'])assert.equal((await h.request(path)).status,410);
 for(const file of ['native-games.html','native-games.js','table-games.html','table-games.js','chess-app.js','chess-worker.js'])assert.equal((await fetch(h.base+'/arcade/'+file)).status,404,file);
 assert.equal((await fetch(h.base+'/games.js')).status,404);
 assert.equal((await fetch(h.base+'/arcade/slope.html')).status,200);
});
test('recovery is one-use and revokes sessions; static backend files remain private',async t=>{
 const h=await harness(t),a=await h.register('recovery_a');
 const reset=await h.request('auth/recovery',{data:{action:'reset',username:'recovery_a',code:a.data.recoveryCode,newPassword:'Replacement-passphrase-456!'}});assert.equal(reset.status,200,JSON.stringify(reset.data));
 assert.equal((await h.request('profile',{cookie:a.cookie})).status,401);
 assert.equal((await h.request('auth/recovery',{data:{action:'reset',username:'recovery_a',code:a.data.recoveryCode,newPassword:'Third-passphrase-456!'}})).status,400);
 assert.equal((await h.request('auth/login',{data:{username:'recovery_a',password:'Replacement-passphrase-456!'}})).status,200);
 assert.equal((await fetch(h.base+'/arcade/backend-worker.ts')).status,404);
 const html=await(await fetch(h.base+'/')).text();assert.match(html,/<base href="\/arcade\/">/);assert.match(html,/ca-pub-8632851454203675/);
 const wasm=await fetch(h.base+'/arcade/slope-build.wasm',{method:'HEAD'});assert.equal(wasm.status,200);assert.equal(wasm.headers.get('content-type'),'application/wasm');
});
test('existing Portal accounts migrate once with working passwords and balances',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'pixel-migration-'));t.after(()=>rm(dir,{recursive:true,force:true}));const dbPath=join(dir,'portal.sqlite');
 let app=await createPortal({dbPath});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');let base=`http://127.0.0.1:${app.server.address().port}`;
 const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'Existing_Player',password:'Existing-passphrase-456!'})});assert.equal(r.status,201);await app.close();
 app=await createPortal({dbPath});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');base=`http://127.0.0.1:${app.server.address().port}`;
 const login=await fetch(base+'/arcade-api/auth/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'Existing_Player',password:'Existing-passphrase-456!'})});assert.equal(login.status,200,await login.text());
 assert.equal(app.arcade.db.prepare('SELECT coins FROM market_wallets WHERE user_id=?').get('portal:1').coins,2500);await app.close();
 app=await createPortal({dbPath});assert.equal(app.arcade.db.prepare('SELECT COUNT(*) AS n FROM arcade_accounts').get().n,1);assert.equal(app.arcade.db.prepare('SELECT coins FROM market_wallets WHERE user_id=?').get('portal:1').coins,2500);await app.close();
});

test('catalogues reject provider redirects and removed minigames while retaining real embeds',async()=>{
 const {runInNewContext}=await import('node:vm');const context={URL};runInNewContext(await readFile(new URL('./game-policy.js',import.meta.url),'utf8'),context);const allowed=context.pixelGameAllowed;
 for(const g of [{id:'reversi',embed:'./table-games.html?game=reversi'},{id:'custom-1',embed:'https://katsugachi.github.io/Solus-MS/'},{id:'x',embed:'https://eiym.org/gn-math/1.html'},{id:'x',embed:'https://example.com/game',providerLaunch:true},{id:'x',embed:'https://example.com/game',isolatedLaunch:true}])assert.equal(allowed(g),false,JSON.stringify(g));
 const catalogue=JSON.parse(await readFile(new URL('./catalogue.json',import.meta.url)));assert.ok(catalogue.games.every(allowed));const featured=catalogue.games.filter(g=>g.source==='Featured embeds');assert.equal(featured.length,12);assert.equal(new Set(featured.map(g=>g.url)).size,12);assert.ok(featured.every(g=>g.inlineOnly&&new URL(g.url).hostname==='10minutestilldawnonline.github.io'));
 const {prepareArcade}=await import('./arcade-runtime.mjs');const app=await prepareArcade();const originals=JSON.parse(await readFile(join(app.directory,'originals.json'),'utf8'));assert.deepEqual(originals.map(g=>g.name),['Slope']);assert.ok(originals.every(allowed));
 const ports=JSON.parse(await readFile(new URL('./webports.json',import.meta.url)));assert.ok(ports.games.every(allowed));assert.equal(allowed({id:'slope',embed:'./slope.html'}),true);
});

test('existing-service bridge preserves account credentials and records with HttpOnly sessions',async t=>{
 const {createArcade}=await import('./arcade-runtime.mjs');const original=await createArcade({dbPath:':memory:',adminUsername:'owner_test'});t.after(()=>original.close());
 const origin='https://existing-arcade.example';let originalToken='';
 // Emulate the original GitHub bearer transport using the same real account database.
 const oldFetch=async(input,init)=>{const incoming=input instanceof Request?input:new Request(input,init);assert.equal(incoming.headers.get('origin'),'https://hellven73.github.io');assert.equal(incoming.headers.get('x-pixel-client'),'github-pages');assert.equal(incoming.headers.get('OAI-Sites-Authorization'),'Bearer test-service-access');const headers=new Headers(incoming.headers);headers.set('Origin',origin);headers.set('X-Pixel-Client','pixel-arcade');const token=/^Bearer ([a-f0-9]{64})$/.exec(headers.get('authorization')||'')?.[1];if(token)headers.set('Cookie','__Host-px-session='+token);const response=await original.fetch(new Request(incoming,{headers}));const data=await response.json().catch(()=>null);if(response.ok&&/\/api\/auth\/(login|register)$/.test(new URL(incoming.url).pathname)){const session=/__Host-px-session=([a-f0-9]{64})/.exec(response.headers.get('set-cookie')||'')?.[1];return Response.json({...data,token:session,remember:true,expiresAt:Date.now()+86400000},{status:response.status});}return Response.json(data,{status:response.status});};
 const oldRequest=async(path,data)=>{const r=await oldFetch(new Request(origin+'/api/'+path,{method:data?'POST':'GET',headers:{Origin:'https://hellven73.github.io','X-Pixel-Client':'github-pages','OAI-Sites-Authorization':'Bearer test-service-access',...(originalToken?{Authorization:'Bearer '+originalToken}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})}));assert.ok(r.status<400,await r.clone().text());return r.json();};
 originalToken=(await oldRequest('auth/register',{username:'owner_test',password:'Original-passphrase-6789!',remember:true})).token;
 await oldRequest('chat',{action:'send',server:'pixel-public-lobby',channel:'pixel-public-general',body:'Original database message'});
 await oldRequest('roles',{action:'create',name:'Original role',color:'#aabbcc',position:1,moderate:false});
 const before=await oldRequest('marketplace');
 const options={arcadeApiOrigin:origin,arcadeServiceAuthorization:'test-service-access',arcadeFetch:oldFetch};const h=await harness(t,options);
 const login=await h.request('auth/login',{data:{username:'owner_test',password:'Original-passphrase-6789!',remember:true}});assert.equal(login.status,200);assert.ok(login.cookie);assert.match(login.setCookie,/HttpOnly/);assert.match(login.setCookie,/SameSite=Lax/);assert.ok(!('token' in login.data));
 const profile=await h.request('profile',{cookie:login.cookie});assert.equal(profile.data.username,'owner_test');assert.equal(profile.data.isAdmin,true);
 const chat=await h.request('chat?server=pixel-public-lobby&channel=pixel-public-general',{cookie:login.cookie});assert.ok(chat.data.messages.some(m=>m.body==='Original database message'));
 const roles=await h.request('roles',{cookie:login.cookie});assert.ok(JSON.stringify(roles.data).includes('Original role'));
 assert.equal((await h.request('marketplace',{cookie:login.cookie})).data.coins,before.coins);
 const restarted=await harness(t,options);assert.equal((await restarted.request('profile',{cookie:login.cookie})).data.username,'owner_test');
 const framex=await restarted.request('dev/framex?status=1',{cookie:login.cookie});assert.equal(framex.data.unlocked,true);assert.equal(framex.data.adminAccess,true);
 assert.equal((await restarted.request('dev/framex',{cookie:login.cookie})).status,200);assert.equal((await restarted.request('dev/framex')).status,401);
 const stranger=await restarted.register('regular_test');assert.equal((await restarted.request('dev/framex?status=1',{cookie:stranger.cookie})).data.unlocked,false);
 await h.request('auth/logout',{cookie:login.cookie,data:{}});assert.equal((await restarted.request('profile',{cookie:login.cookie})).data.authenticated,false);
});
