import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createPortal} from './server.mjs';

// Simulate Neon storing SQLite snapshots without connecting to a production DB.
test('account passwords and private state survive a cloud-backed server restart',async()=>{
 const stored={portal:null,arcade:null};
 const cloud=()=>({
  snapshots:{portal:stored.portal,arcade:stored.arcade},
  async flushIfChanged(portal,arcade){
   stored.portal=Buffer.from(portal.serialize());
   stored.arcade=Buffer.from(arcade.serialize());
  },
  async close(){}
 });
 async function start(){
  const app=await createPortal({cloudSnapshots:cloud(),dbPath:':memory:',adminUsername:'archangel'});
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const url='http://127.0.0.1:'+app.server.address().port;
  const request=async(path,body)=>{
   const response=await fetch(url+path,{
    method:body?'POST':'GET',headers:{Origin:url,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
   });
   return {status:response.status,data:await response.json()};
  };
  return{app,request};
 }
 const before=await start();
 let res=await before.request('/arcade-api/auth/register',{username:'durable_player',password:'A-strong-test-password-123!'});
 assert.equal(res.status,201,JSON.stringify(res.data));
 res=await before.request('/api/auth/register',{username:'durable_portal',password:'A-strong-test-password-123!'});
 assert.equal(res.status,201,JSON.stringify(res.data));
 await before.app.close();
 assert.ok(stored.portal?.length>0);
 assert.ok(stored.arcade?.length>0);
 const after=await start();
 try{
  res=await after.request('/arcade-api/auth/login',{username:'durable_player',password:'A-strong-test-password-123!'});
  assert.equal(res.status,200,JSON.stringify(res.data));
  res=await after.request('/api/auth/login',{username:'durable_portal',password:'A-strong-test-password-123!'});
  assert.equal(res.status,200,JSON.stringify(res.data));
  res=await after.request('/arcade-api/auth/login',{username:'durable_player',password:'wrong-password'});
  assert.equal(res.status,401);
 }finally{await after.app.close()}
});
