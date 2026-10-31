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
 async function request(path,{data,cookie,method=data?'POST':'GET',origin=base}={}){const r=await fetch(base+'/arcade-api/'+path,{method,headers:{Origin:origin,...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
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
