import test from 'node:test';
import assert from 'node:assert/strict';
import {createArcade} from './arcade-runtime.mjs';
const guest='12345678-1234-4234-9234-123456789012';
test('guest progress persists, ticks are bounded and replay safe, reports aggregate and admin reports stay private',async t=>{
 const app=await createArcade({dbPath:':memory:'});t.after(()=>app.close());
 const call=(body,query='')=>app.fetch(new Request('http://localhost/api/engagement?guest='+guest+query,{method:body?'POST':'GET',headers:{Origin:'http://localhost','Content-Type':'application/json'},...(body?{body:JSON.stringify({guest,...body})}:{})}));
 let r=await call();assert.equal(r.status,200);assert.equal((await r.json()).totals.play,0);
 const tick={action:'tick',event:crypto.randomUUID(),seconds:30,mode:'play',game:'example',name:'Example'};await call(tick);
 app.db.prepare('UPDATE engagement_totals SET last=?').run(Date.now()-16000);
 tick.event=crypto.randomUUID();tick.seconds=15;await call(tick);await call(tick);
 const data=await(await call()).json();assert.ok(data.totals.play>=14&&data.totals.play<=16);assert.equal(data.recent[0].game,'example');assert.equal(data.achievements.find(a=>a.id==='first').unlocked,true);
 r=await call({...tick,event:crypto.randomUUID(),seconds:100});assert.equal(r.status,400);
 await call({action:'status',game:'example',status:'working'});await call({action:'status',game:'example',status:'issues'});const votes=await(await call(null,'&game=example')).json();assert.equal(votes.votes.length,1);assert.equal(votes.votes[0].status,'issues');assert.equal(votes.votes[0].count,1);
 r=await call({action:'bug',id:crypto.randomUUID(),game:'example',body:'The loading screen freezes.'});assert.equal(r.status,200);assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM game_bug_reports').get().n,1);
 assert.equal((await call(null,'&admin=1')).status,403);
 app.db.prepare('UPDATE engagement_totals SET last=?').run(Date.now()-16000);await call({...tick,event:crypto.randomUUID(),mode:'browse',seconds:15});const after=await(await call()).json();assert.ok(after.totals.browse>=14);assert.equal(after.totals.play,data.totals.play);
 const bad=await app.fetch(new Request('http://localhost/api/engagement',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({guest,...tick})}));assert.equal(bad.status,403);
});

test('progress works with the existing remote account service and the GitHub mirror',async t=>{
 const {createPortal}=await import('./server.mjs');const {once}=await import('node:events');let forwarded=0;
 const app=await createPortal({dbPath:':memory:',arcadeApiOrigin:'https://accounts.example',arcadeFetch:async(url,options)=>{if(new URL(url).pathname!=='/api/profile'){forwarded++;return Response.json({error:'Not found'},{status:404})}return options.headers.get('Authorization')?Response.json({authenticated:true,username:'player',isAdmin:false}):Response.json({authenticated:false},{status:401})}});
 app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(()=>app.close());const base='http://127.0.0.1:'+app.server.address().port;
 const r=await fetch(base+'/arcade-api/engagement?guest='+guest);assert.equal(r.status,200);assert.equal((await r.json()).guest,true);
 const token='a'.repeat(64),signed=await fetch(base+'/github-api/engagement?guest='+guest,{headers:{Origin:'https://hellven73.github.io',Authorization:'Bearer '+token}});assert.equal(signed.status,200);assert.equal((await signed.json()).guest,false);assert.equal(forwarded,0);
});

test('guest achievements and reports survive a remote-service frontend restart',async()=>{
 const {createPortal}=await import('./server.mjs'),{once}=await import('node:events');let saved;
 const start=async()=>{const app=await createPortal({cloudSnapshots:{snapshots:{portal:saved},flushIfChanged:async(db)=>{saved=Buffer.from(db.serialize())},close:async()=>{}},arcadeApiOrigin:'https://accounts.example',arcadeFetch:async()=>Response.json({authenticated:false},{status:401})});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const base='http://127.0.0.1:'+app.server.address().port;return{app,call:async body=>{const r=await fetch(base+'/arcade-api/engagement?guest='+guest,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify({guest,...body})}:{})});assert.equal(r.status,200);return r.json()}}};
 const first=await start();await first.call({action:'tick',event:crypto.randomUUID(),mode:'play',seconds:0,game:'persisted',name:'Persisted game'});await first.call({action:'bug',id:crypto.randomUUID(),game:'persisted',body:'A test report kept after restart.'});await first.app.close();const second=await start();try{const data=await second.call();assert.equal(data.recent[0].game,'persisted');assert.equal(data.achievements[0].unlocked,true);}finally{await second.app.close()}
});

test('requests enforce account votes, rewards enforce thresholds, and presence is opt-in and friends-only',async t=>{
 const app=await createArcade({dbPath:':memory:'});t.after(()=>app.close());
 async function register(username){const r=await app.fetch(new Request('http://localhost/api/auth/register',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({username,password:'testing123'})}));assert.equal(r.status,201);return r.headers.get('set-cookie').split(';')[0]}
 const a=await register('requester'),b=await register('frienduser'),c=await register('outsider');
 const call=(cookie,body,query='',path='engagement')=>app.fetch(new Request('http://localhost/api/'+path+'?guest='+guest+query,{method:body?'POST':'GET',headers:{Origin:'http://localhost','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify({guest,...body})}:{})}));
 assert.equal((await call('',{action:'request',title:'Test game'})).status,401);
 const request=await(await call(a,{action:'request',title:'Test game',description:'A requested title.'})).json();assert.ok(request.id);assert.equal((await call(b,{action:'request',title:'test game'})).status,409);
 await call(b,{action:'vote',id:request.id});await call(b,{action:'vote',id:request.id});let feed=await(await call(a,null,'&requests=1')).json();assert.equal(feed.requests[0].votes,2);assert.equal((await call(b,{action:'request-state',id:request.id,state:'added'})).status,403);
 assert.equal((await call(a,{action:'claim',achievement:'explorer'})).status,403);await call(a,{action:'tick',event:crypto.randomUUID(),mode:'play',seconds:0,game:'hextris',name:'Hextris'});assert.equal((await call(a,{action:'claim',achievement:'first'})).status,200);await call(a,{action:'equip',achievement:'first'});let data=await(await call(a)).json();assert.equal(data.preferences.title,'New Challenger');
 await call(a,{action:'request',username:'frienduser'},'','social');await call(b,{action:'accept',username:'requester'},'','social');await call(a,{action:'tick',event:crypto.randomUUID(),mode:'play',seconds:0,game:'hextris',name:'Hextris'});
 let friends=await(await call(b,null,'&friends=1')).json();assert.equal(friends.friends[0].online,false);await call(a,{action:'sharing',enabled:true});friends=await(await call(b,null,'&friends=1')).json();assert.equal(friends.friends[0].online,true);assert.equal(friends.friends[0].game,'Hextris');assert.equal((await(await call(c,null,'&friends=1')).json()).friends.length,0);await call(a,{action:'sharing',enabled:false});friends=await(await call(b,null,'&friends=1')).json();assert.equal(friends.friends[0].online,false);assert.equal(friends.friends[0].game,undefined);
});

test('XP and levels derive from saved activity; profile badges expose only progression',async t=>{
 const {progression}=await import('./engagement-api.mjs');assert.deepEqual(progression({}),{xp:0,level:1,start:0,next:100,earned:0,needed:100,achievements:0,totalAchievements:8});
 const p=progression({games:5,qualified:5,play:300,browse:300});assert.equal(p.xp,505);assert.equal(p.level,3);assert.equal(p.achievements,2);assert.equal(p.next,900);
 const app=await createArcade({dbPath:':memory:'});t.after(()=>app.close());const reg=await app.fetch(new Request('http://localhost/api/auth/register',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({username:'levelplayer',password:'testing123'})}));const cookie=reg.headers.get('set-cookie').split(';')[0];
 const req=(body)=>app.fetch(new Request('http://localhost/api/engagement?guest='+guest,{method:body?'POST':'GET',headers:{Origin:'http://localhost',Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify({guest,...body})}:{})}));await req();await req({action:'tick',event:crypto.randomUUID(),mode:'play',game:'hextris',name:'Hextris',seconds:0,xp:999999});const data=await(await req()).json();assert.equal(data.progression.xp,100);assert.equal(data.progression.level,2);assert.equal(data.progression.achievements,1);
 const publicData=await(await app.fetch(new Request('http://localhost/api/engagement?profile=levelplayer'))).json();assert.deepEqual(Object.keys(publicData),['progression']);assert.equal(publicData.progression.achievements,1);assert.equal(publicData.progression.xp,100);
 await req({action:'claim',achievement:'first'});await req({action:'claim',achievement:'first'});assert.equal((await(await req()).json()).progression.xp,100);
});

test('background account restore deduplicates requests and preserves identity through temporary failures',async()=>{
 const {readFile}=await import('node:fs/promises'),{runInNewContext}=await import('node:vm');const {files}=JSON.parse(await readFile(new URL('./arcade-overrides.json',import.meta.url),'utf8'));const source=files['hub.js'].slice(files['hub.js'].indexOf('let accountRequest='),files['hub.js'].indexOf('let accountMode='));let calls=0,resolve,response,button={},timers=[];
 const context={request:()=>{calls++;return new Promise(r=>resolve=r)},window:{addEventListener(){}},document:{hidden:false,addEventListener(){},dispatchEvent(){}},navigator:{onLine:true},CustomEvent:class{},$:()=>button,setTimeout:(fn)=>{timers.push(fn);return timers.length},clearTimeout(){},Date,accountLoaded:false,authenticated:false,profile:null,accountView(){}};runInNewContext(source+';globalThis.load=loadAccount;globalThis.refresh=refreshSavedSession;',context);
 const a=context.load(),b=context.load();assert.equal(a,b);assert.equal(calls,1);resolve({authenticated:true,username:'player',profile:{name:'Player'},isAdmin:false});await a;assert.equal(context.window.pixelAccountUsername,'player');context.refresh();assert.equal(calls,1);
 context.request=async()=>{throw Object.assign(Error('Temporary outage'),{status:502})};await assert.rejects(context.load());assert.equal(context.window.pixelAccountUsername,'player');assert.equal(context.authenticated,true);assert.equal(timers.length,1);
 context.request=async()=>{throw Object.assign(Error('Expired'),{status:401})};await context.load();assert.equal(context.window.pixelAccountUsername,null);assert.equal(context.authenticated,false);
});
