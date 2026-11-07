const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const achievements=[{id:'first',name:'First launch',goal:1,metric:'games',reward:'New Challenger'},{id:'explorer',name:'Variety I',goal:5,metric:'qualified',reward:'Game Explorer'},{id:'variety2',name:'Variety II',goal:10,metric:'qualified',reward:'Genre Hopper'},{id:'variety3',name:'Variety III',goal:25,metric:'qualified',reward:'Arcade Connoisseur'},{id:'regular',name:'Playtime I',goal:3600,metric:'play',reward:'Arcade Regular'},{id:'marathon',name:'Playtime II',goal:18000,metric:'play',reward:'Dedicated Player'},{id:'play3',name:'Playtime III',goal:72000,metric:'play',reward:'Pixel Veteran'},{id:'curious',name:'Around the arcade',goal:1800,metric:'browse',reward:'Curious Mind'}];
export async function engagement(req,{DB,getAccount,sameOrigin,isAdmin,limited,json,getFriends=async()=>[]}){
 for(const sql of [
 'CREATE TABLE IF NOT EXISTS player_activity(owner TEXT PRIMARY KEY,username TEXT,mode TEXT,game TEXT,updated REAL)',
 "CREATE TABLE IF NOT EXISTS player_preferences(owner TEXT PRIMARY KEY,sharing INTEGER NOT NULL DEFAULT 0,title TEXT NOT NULL DEFAULT '')",
 'CREATE TABLE IF NOT EXISTS achievement_claims(owner TEXT,achievement TEXT,created REAL,PRIMARY KEY(owner,achievement))',
 'CREATE TABLE IF NOT EXISTS game_requests(id TEXT PRIMARY KEY,title TEXT,description TEXT,owner TEXT,state TEXT,created REAL)',
 'CREATE TABLE IF NOT EXISTS game_request_votes(request TEXT,owner TEXT,PRIMARY KEY(request,owner))',
 'CREATE TABLE IF NOT EXISTS engagement_totals(owner TEXT PRIMARY KEY,play REAL NOT NULL DEFAULT 0,browse REAL NOT NULL DEFAULT 0,last REAL NOT NULL DEFAULT 0)',
 'CREATE TABLE IF NOT EXISTS engagement_recent(owner TEXT,game TEXT,name TEXT,seconds REAL NOT NULL DEFAULT 0,played REAL,PRIMARY KEY(owner,game))',
 'CREATE TABLE IF NOT EXISTS engagement_events(owner TEXT,event TEXT,created REAL,PRIMARY KEY(owner,event))',
 'CREATE TABLE IF NOT EXISTS game_health(owner TEXT,game TEXT,name TEXT,status TEXT,updated REAL,PRIMARY KEY(owner,game))',
 'CREATE TABLE IF NOT EXISTS game_bug_reports(id TEXT PRIMARY KEY,owner TEXT,game TEXT,name TEXT,body TEXT,created REAL)'])await DB.prepare(sql).run();
 const u=await getAccount(req),url=new URL(req.url),b=req.method==='POST'?await req.json().catch(()=>null):null,guest=b?.guest||url.searchParams.get('guest');
 if(!u&&!uuid.test(guest||''))return json({error:'A browser guest identifier is required.'},400);
 const owner=u?'user:'+u.userId:'guest:'+guest;
 const gameValid=g=>typeof g==='string'&&/^[\w.:/-]{1,160}$/.test(g);
 async function metrics(){const totals=await DB.prepare('SELECT play,browse FROM engagement_totals WHERE owner=?').bind(owner).first()||{play:0,browse:0};const count=await DB.prepare('SELECT COUNT(*) AS games,SUM(CASE WHEN seconds>=60 THEN 1 ELSE 0 END) AS qualified FROM engagement_recent WHERE owner=?').bind(owner).first();return{...totals,games:count.games,qualified:count.qualified||0}}
 if(req.method==='GET'){
  if(url.searchParams.has('requests'))return json({signedIn:!!u,admin:isAdmin(u),requests:(await DB.prepare('SELECT r.id,r.title,r.description,r.state,r.created,COUNT(v.owner) AS votes,MAX(CASE WHEN v.owner=? THEN 1 ELSE 0 END) AS voted FROM game_requests r LEFT JOIN game_request_votes v ON v.request=r.id GROUP BY r.id ORDER BY votes DESC,r.created DESC LIMIT 50').bind(owner).all()).results});
  if(url.searchParams.has('friends')){if(!u)return json({error:'Sign in to see friend activity.'},401);const names=await getFriends(req,u);const list=[];for(const name of names.slice(0,200)){const row=await DB.prepare('SELECT a.mode,a.game,a.updated,p.sharing,p.title FROM player_activity a JOIN player_preferences p ON p.owner=a.owner WHERE a.username=? AND p.sharing=1 ORDER BY a.updated DESC LIMIT 1').bind(name).first();list.push({username:name,online:!!row&&row.updated>Date.now()-45000,...(row&&row.updated>Date.now()-45000?{mode:row.mode,game:row.game,title:row.title}:{})})}return json({friends:list})}

  if(url.searchParams.has('admin')){if(!isAdmin(u))return json({error:'Administrator access required.'},403);return json({reports:(await DB.prepare('SELECT id,game,name,body,created FROM game_bug_reports ORDER BY created DESC LIMIT 100').all()).results});}
  if(url.searchParams.has('health'))return json({votes:(await DB.prepare('SELECT game,status,COUNT(*) AS count,MAX(updated) AS updated FROM game_health WHERE updated>? GROUP BY game,status').bind(Date.now()-30*86400000).all()).results});
  if(url.searchParams.has('game')){const game=url.searchParams.get('game');if(!gameValid(game))return json({error:'Invalid game.'},400);const votes=(await DB.prepare('SELECT status,COUNT(*) AS count,MAX(updated) AS updated FROM game_health WHERE game=? AND updated>? GROUP BY status').bind(game,Date.now()-30*86400000).all()).results;return json({votes});}
  await DB.prepare('INSERT OR IGNORE INTO engagement_totals(owner,last) VALUES(?,?)').bind(owner,Date.now()).run();
  const totals=await DB.prepare('SELECT play,browse FROM engagement_totals WHERE owner=?').bind(owner).first()||{play:0,browse:0};const recent=(await DB.prepare('SELECT game,name,seconds,played FROM engagement_recent WHERE owner=? ORDER BY played DESC LIMIT 12').bind(owner).all()).results;const n=await DB.prepare('SELECT COUNT(*) AS count FROM engagement_recent WHERE owner=?').bind(owner).first();const m=await metrics(),prefs=await DB.prepare('SELECT sharing,title FROM player_preferences WHERE owner=?').bind(owner).first()||{sharing:0,title:''},claims=(await DB.prepare('SELECT achievement FROM achievement_claims WHERE owner=?').bind(owner).all()).results.map(r=>r.achievement);return json({totals,recent,history:(await DB.prepare('SELECT game,seconds,played FROM engagement_recent WHERE owner=? ORDER BY seconds DESC LIMIT 500').bind(owner).all()).results,gamesPlayed:n.count,qualifiedGames:m.qualified,preferences:prefs,guest:!u,achievements:achievements.map(a=>({...a,progress:Math.min(a.goal,m[a.metric]),unlocked:m[a.metric]>=a.goal,claimed:claims.includes(a.id)}))});
 }
 if(req.method!=='POST')return json({error:'Method not allowed.'},405);
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 if(!b||typeof b!=='object')return json({error:'Invalid request.'},400);
 if(await limited(req,'activity',owner))return json({error:'Too many updates. Try again later.'},429);
 const now=Date.now();
 if(['request','vote','request-state','sharing','claim','equip'].includes(b.action)&&!u)return json({error:'Sign in to use this feature.'},401);
 if(b.action==='sharing'){if(typeof b.enabled!=='boolean')return json({error:'Invalid preference.'},400);await DB.prepare("INSERT INTO player_preferences(owner,sharing) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET sharing=excluded.sharing").bind(owner,b.enabled?1:0).run();if(!b.enabled)await DB.prepare('DELETE FROM player_activity WHERE owner=?').bind(owner).run();return json({ok:true})}
 if(b.action==='claim'){const a=achievements.find(a=>a.id===b.achievement),m=await metrics();if(!a||m[a.metric]<a.goal)return json({error:'Achievement is not unlocked yet.'},403);await DB.prepare('INSERT OR IGNORE INTO achievement_claims VALUES(?,?,?)').bind(owner,a.id,now).run();return json({ok:true,reward:a.reward})}
 if(b.action==='equip'){const a=achievements.find(a=>a.id===b.achievement);if(b.achievement!==''&&(!a||!await DB.prepare('SELECT achievement FROM achievement_claims WHERE owner=? AND achievement=?').bind(owner,a.id).first()))return json({error:'Claim this title first.'},403);await DB.prepare("INSERT INTO player_preferences(owner,title) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET title=excluded.title").bind(owner,a?.reward||'').run();return json({ok:true})}
 if(b.action==='request'){const title=String(b.title||'').trim().replace(/\s+/g,' '),description=String(b.description||'').trim();if(title.length<2||title.length>80||description.length>400)return json({error:'Use a game title of 2–80 characters and a note under 400 characters.'},400);const prior=await DB.prepare('SELECT id FROM game_requests WHERE LOWER(title)=LOWER(?)').bind(title).first();if(prior)return json({error:'This game has already been requested. Vote for it instead.'},409);const count=await DB.prepare('SELECT COUNT(*) AS n FROM game_requests WHERE owner=? AND created>?').bind(owner,now-86400000).first();if(count.n>=5)return json({error:'You can request five games per day.'},429);const id=crypto.randomUUID();await DB.batch([DB.prepare("INSERT INTO game_requests VALUES(?,?,?,?,'requested',?)").bind(id,title,description,owner,now),DB.prepare('INSERT INTO game_request_votes VALUES(?,?)').bind(id,owner)]);return json({ok:true,id})}
 if(b.action==='vote'){if(!await DB.prepare('SELECT id FROM game_requests WHERE id=?').bind(String(b.id)).first())return json({error:'Request not found.'},404);if(b.enabled===false)await DB.prepare('DELETE FROM game_request_votes WHERE request=? AND owner=?').bind(b.id,owner).run();else await DB.prepare('INSERT OR IGNORE INTO game_request_votes VALUES(?,?)').bind(b.id,owner).run();return json({ok:true})}
 if(b.action==='request-state'){if(!isAdmin(u))return json({error:'Administrator access required.'},403);if(!['requested','planned','added','declined'].includes(b.state))return json({error:'Invalid request state.'},400);await DB.prepare('UPDATE game_requests SET state=? WHERE id=?').bind(b.state,String(b.id)).run();return json({ok:true})}
 if(b.action==='tick'){


  if(!uuid.test(b.event||'')||!Number.isFinite(b.seconds)||b.seconds<0||b.seconds>30||!['play','browse'].includes(b.mode)||b.mode==='play'&&!gameValid(b.game))return json({error:'Invalid time update.'},400);
  if(await DB.prepare('SELECT event FROM engagement_events WHERE owner=? AND event=?').bind(owner,b.event).first())return json({ok:true,replayed:true});
  if(u)await DB.prepare('INSERT INTO player_activity VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET username=excluded.username,mode=excluded.mode,game=excluded.game,updated=excluded.updated').bind(owner,u.username,b.mode==='play'?'play':'browse',String(b.name||'').slice(0,100),now).run();
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
