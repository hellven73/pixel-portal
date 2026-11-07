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
