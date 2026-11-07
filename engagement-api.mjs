const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const achievements=[{id:'first',name:'First launch',goal:1,metric:'games'},{id:'explorer',name:'Game explorer',goal:5,metric:'games'},{id:'regular',name:'Arcade regular',goal:3600,metric:'play'},{id:'marathon',name:'Time well played',goal:18000,metric:'play'},{id:'curious',name:'Around the arcade',goal:1800,metric:'browse'}];
export async function engagement(req,{DB,getAccount,sameOrigin,isAdmin,limited,json}){
 for(const sql of [
 'CREATE TABLE IF NOT EXISTS engagement_totals(owner TEXT PRIMARY KEY,play REAL NOT NULL DEFAULT 0,browse REAL NOT NULL DEFAULT 0,last REAL NOT NULL DEFAULT 0)',
 'CREATE TABLE IF NOT EXISTS engagement_recent(owner TEXT,game TEXT,name TEXT,seconds REAL NOT NULL DEFAULT 0,played REAL,PRIMARY KEY(owner,game))',
 'CREATE TABLE IF NOT EXISTS engagement_events(owner TEXT,event TEXT,created REAL,PRIMARY KEY(owner,event))',
 'CREATE TABLE IF NOT EXISTS game_health(owner TEXT,game TEXT,name TEXT,status TEXT,updated REAL,PRIMARY KEY(owner,game))',
 'CREATE TABLE IF NOT EXISTS game_bug_reports(id TEXT PRIMARY KEY,owner TEXT,game TEXT,name TEXT,body TEXT,created REAL)'])await DB.prepare(sql).run();
 const u=await getAccount(req),url=new URL(req.url),b=req.method==='POST'?await req.json().catch(()=>null):null,guest=b?.guest||url.searchParams.get('guest');
 if(!u&&!uuid.test(guest||''))return json({error:'A browser guest identifier is required.'},400);
 const owner=u?'user:'+u.userId:'guest:'+guest;
 const gameValid=g=>typeof g==='string'&&/^[\w.:/-]{1,160}$/.test(g);
 if(req.method==='GET'){
  if(url.searchParams.has('admin')){if(!isAdmin(u))return json({error:'Administrator access required.'},403);return json({reports:(await DB.prepare('SELECT id,game,name,body,created FROM game_bug_reports ORDER BY created DESC LIMIT 100').all()).results});}
  if(url.searchParams.has('health'))return json({votes:(await DB.prepare('SELECT game,status,COUNT(*) AS count,MAX(updated) AS updated FROM game_health WHERE updated>? GROUP BY game,status').bind(Date.now()-30*86400000).all()).results});
  if(url.searchParams.has('game')){const game=url.searchParams.get('game');if(!gameValid(game))return json({error:'Invalid game.'},400);const votes=(await DB.prepare('SELECT status,COUNT(*) AS count,MAX(updated) AS updated FROM game_health WHERE game=? AND updated>? GROUP BY status').bind(game,Date.now()-30*86400000).all()).results;return json({votes});}
  await DB.prepare('INSERT OR IGNORE INTO engagement_totals(owner,last) VALUES(?,?)').bind(owner,Date.now()).run();
  const totals=await DB.prepare('SELECT play,browse FROM engagement_totals WHERE owner=?').bind(owner).first()||{play:0,browse:0};const recent=(await DB.prepare('SELECT game,name,seconds,played FROM engagement_recent WHERE owner=? ORDER BY played DESC LIMIT 12').bind(owner).all()).results;const n=await DB.prepare('SELECT COUNT(*) AS count FROM engagement_recent WHERE owner=?').bind(owner).first();const metrics={...totals,games:n.count};return json({totals,recent,guest:!u,achievements:achievements.map(a=>({...a,progress:Math.min(a.goal,metrics[a.metric]),unlocked:metrics[a.metric]>=a.goal}))});
 }
 if(req.method!=='POST')return json({error:'Method not allowed.'},405);
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 if(!b||typeof b!=='object')return json({error:'Invalid request.'},400);
 if(await limited(req,'activity',owner))return json({error:'Too many updates. Try again later.'},429);
 const now=Date.now();
 if(b.action==='tick'){
  if(!uuid.test(b.event||'')||!Number.isFinite(b.seconds)||b.seconds<0||b.seconds>30||!['play','browse'].includes(b.mode)||b.mode==='play'&&!gameValid(b.game))return json({error:'Invalid time update.'},400);
  if(await DB.prepare('SELECT event FROM engagement_events WHERE owner=? AND event=?').bind(owner,b.event).first())return json({ok:true,replayed:true});
  await DB.prepare('INSERT OR IGNORE INTO engagement_totals(owner,last) VALUES(?,?)').bind(owner,now).run();
  const row=await DB.prepare('SELECT last FROM engagement_totals WHERE owner=?').bind(owner).first();const seconds=Math.min(b.seconds,Math.max(0,(now-row.last)/1000),30);
  const statements=[DB.prepare('INSERT INTO engagement_events VALUES(?,?,?)').bind(owner,b.event,now),DB.prepare('UPDATE engagement_totals SET play=play+?,browse=browse+?,last=? WHERE owner=?').bind(b.mode==='play'?seconds:0,b.mode==='browse'?seconds:0,now,owner),DB.prepare('DELETE FROM engagement_events WHERE created<?').bind(now-86400000)];
  if(b.mode==='play')statements.push(DB.prepare('INSERT INTO engagement_recent VALUES(?,?,?,?,?) ON CONFLICT(owner,game) DO UPDATE SET name=excluded.name,seconds=engagement_recent.seconds+excluded.seconds,played=excluded.played').bind(owner,b.game,String(b.name||b.game).slice(0,100),seconds,now));await DB.batch(statements);return json({ok:true,credited:seconds});
 }
 if(b.action==='status'){
  if(!gameValid(b.game)||!['working','issues','unavailable'].includes(b.status))return json({error:'Choose a valid game status.'},400);
  await DB.prepare('INSERT INTO game_health VALUES(?,?,?,?,?) ON CONFLICT(owner,game) DO UPDATE SET status=excluded.status,name=excluded.name,updated=excluded.updated').bind(owner,b.game,String(b.name||b.game).slice(0,100),b.status,now).run();return json({ok:true});
 }
 if(b.action==='bug'){
  if(!uuid.test(b.id||'')||!gameValid(b.game)||typeof b.body!=='string'||b.body.trim().length<10||b.body.length>1500)return json({error:'Describe the bug in 10–1,500 characters.'},400);
  const count=await DB.prepare('SELECT COUNT(*) AS n FROM game_bug_reports WHERE owner=? AND created>?').bind(owner,now-3600000).first();if(count.n>=10)return json({error:'Report limit reached. Try again later.'},429);
  await DB.prepare('INSERT OR IGNORE INTO game_bug_reports VALUES(?,?,?,?,?,?)').bind(b.id,owner,b.game,String(b.name||b.game).slice(0,100),b.body.trim(),now).run();return json({ok:true});
 }
 return json({error:'Unknown action.'},400);
}
