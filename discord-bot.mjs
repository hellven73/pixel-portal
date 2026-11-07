import {createPublicKey,verify,createHash,randomUUID} from 'node:crypto';
const site='https://pixelarcade.com.au/arcade/';
export const commands=[
 {name:'game',description:'Find your next game on Pixel Arcade',options:[{type:3,name:'name',description:'Search for a game (leave empty for a suggestion)',max_length:80}]},
 {name:'request-game',description:'Suggest a game for Pixel Arcade',options:[{type:3,name:'title',description:'Game title',required:true,min_length:2,max_length:80},{type:3,name:'note',description:'Why would you like it?',max_length:400}]},
 {name:'new-games',description:'See the newest Pixel Arcade arrivals'}
].map(c=>({...c,type:1,contexts:[0],integration_types:[0]}));
const clean=s=>String(s||'').replace(/[@`*_~<>\\]/g,'').trim();
const message=(description,{title='Pixel Arcade',url=site+'#home',button='Visit Pixel Arcade',privateReply=false}={})=>({type:4,data:{...(privateReply?{flags:64}:{}),allowed_mentions:{parse:[]},embeds:[{title,description,color:0xAA92F4}],components:[{type:1,components:[{type:2,style:5,label:button,url}]}]}});
export function verifyInteraction(raw,signature,timestamp,key,now=Date.now()){
 if(!/^[a-f\d]{128}$/i.test(signature||'')||!/^\d{10,11}$/.test(timestamp||'')||!/^[a-f\d]{64}$/i.test(key||'')||Math.abs(now/1000-Number(timestamp))>300)return false;
 try{return verify(null,Buffer.concat([Buffer.from(timestamp),raw]),createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(key,'hex')]),format:'der',type:'spki'}),Buffer.from(signature,'hex'))}catch{return false}
}
export function createDiscordBot({db,publicKey,applicationId,guildId,getGames,getArrivals,token='',announcementChannel='',flush=async()=>{},fetcher=fetch,now=Date.now}){
 db.exec(`CREATE TABLE IF NOT EXISTS game_requests(id TEXT PRIMARY KEY,title TEXT,description TEXT,owner TEXT,state TEXT,created REAL);
 CREATE TABLE IF NOT EXISTS game_request_votes(request TEXT,owner TEXT,PRIMARY KEY(request,owner));
 CREATE TABLE IF NOT EXISTS discord_interactions(id TEXT PRIMARY KEY,response TEXT,created REAL);
 CREATE TABLE IF NOT EXISTS discord_announcements(guild TEXT,game TEXT,created REAL,PRIMARY KEY(guild,game));
 CREATE TABLE IF NOT EXISTS discord_bot_state(key TEXT PRIMARY KEY,value TEXT);`);
 let checking=false,stopped=false;const configured=!!publicKey&&!!applicationId&&!!guildId;
 async function handle(raw,headers){
  if(!configured)return{status:503,body:{error:'Discord integration is not configured.'}};
  if(!verifyInteraction(raw,headers['x-signature-ed25519'],headers['x-signature-timestamp'],publicKey,now()))return{status:401,body:{error:'Invalid Discord signature.'}};
  let i;try{i=JSON.parse(raw)}catch{return{status:400,body:{error:'Invalid interaction.'}}}
  if(i.application_id!==applicationId)return{status:401,body:{error:'Wrong application.'}};
  if(i.type===1)return{status:200,body:{type:1}};
  if(i.type!==2||i.guild_id!==guildId||!/^\d{16,22}$/.test(i.member?.user?.id||'')||!/^\d{16,22}$/.test(i.id||''))return{status:403,body:message('This bot is available in its configured server only.',{privateReply:true})};
  const prior=db.prepare('SELECT response FROM discord_interactions WHERE id=?').get(i.id);if(prior){await flush();return{status:200,body:JSON.parse(prior.response)}};
  const opts=Object.fromEntries((i.data?.options||[]).map(x=>[x.name,x.value]));let result;
  if(i.data?.name==='game'){
   const games=getGames(),query=clean(opts.name).toLowerCase(),matches=query?games.filter(g=>g.name.toLowerCase().includes(query)):games;
   if(!matches.length)result=message('No match yet. Try another title or use /request-game.',{privateReply:true,url:site+'#all',button:'Browse games'});
   else{const game=matches[parseInt(createHash('sha256').update(i.id).digest('hex').slice(0,8),16)%matches.length];result=message('Find **'+clean(game.name)+'** in the game library. Availability depends on the game and your connection.',{title:clean(game.name),url:site+'#all',button:'Open game library'})}
  }else if(i.data?.name==='request-game'){
   const title=clean(opts.title).replace(/\s+/g,' '),note=clean(opts.note),owner='discord:'+createHash('sha256').update(guildId+':'+i.member.user.id).digest('hex');
   const count=db.prepare('SELECT COUNT(*) AS n,MAX(created) AS last FROM game_requests WHERE owner=? AND created>?').get(owner,now()-86400000);
   if(title.length<2||title.length>80||note.length>400)result=message('Use a title of 2–80 characters and a note under 400 characters.',{privateReply:true});
   else if(db.prepare('SELECT id FROM game_requests WHERE LOWER(title)=LOWER(?)').get(title))result=message('That game is already requested. Visit Game requests to vote for it.',{privateReply:true});
   else if(count.n>=5||count.last>now()-120000)result=message('Please wait two minutes between requests. You can suggest five games per day.',{privateReply:true});
   else{const id=randomUUID();db.exec('BEGIN IMMEDIATE');try{db.prepare("INSERT INTO game_requests VALUES(?,?,?,?,'requested',?)").run(id,title,note,owner,now());db.prepare('INSERT INTO game_request_votes VALUES(?,?)').run(id,owner);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}result=message('**'+title+'** was added to the website’s request queue. Requests are reviewed for availability and permission to host.',{privateReply:true,button:'See game requests'})}
  }else if(i.data?.name==='new-games'){
   const arrivals=getArrivals();result=message(arrivals.length?arrivals.slice(0,8).map(g=>'• **'+clean(g.name)+'**').join('\n')+'\n\nOpen the homepage for launch buttons. Some games need separate accounts or your own game files.':'No recent additions. Explore the game library instead.',{title:'New on Pixel Arcade',button:'See new games'});
  }else result=message('Try /game, /request-game, or /new-games.',{privateReply:true});
  db.prepare('INSERT INTO discord_interactions VALUES(?,?,?)').run(i.id,JSON.stringify(result),now());db.prepare('DELETE FROM discord_interactions WHERE created<?').run(now()-86400000);await flush();return{status:200,body:result};
 }
 async function announce(){
  if(stopped||checking||!configured||!token||!/^\d{16,22}$/.test(announcementChannel))return;checking=true;
  try{
   const arrivals=getArrivals();const initialized=db.prepare("SELECT value FROM discord_bot_state WHERE key='announcement-baseline'").get();
   if(!initialized){for(const g of arrivals)db.prepare('INSERT OR IGNORE INTO discord_announcements VALUES(?,?,?)').run(guildId,g.id,now());db.prepare("INSERT INTO discord_bot_state VALUES('announcement-baseline','1')").run();await flush();return}
   const pending=arrivals.filter(g=>!db.prepare('SELECT game FROM discord_announcements WHERE guild=? AND game=?').get(guildId,g.id));if(!pending.length)return;
   const last=Number(db.prepare("SELECT value FROM discord_bot_state WHERE key='announcement-last'").get()?.value||0);if(now()-last<86400000)return;
   // Verify the configured channel belongs to the allowed server before any post.
   const channel=await fetcher('https://discord.com/api/v10/channels/'+announcementChannel,{headers:{Authorization:'Bot '+token},signal:AbortSignal.timeout(5000)});if(!channel.ok)return;const data=await channel.json();if(data.guild_id!==guildId||data.type!==0)return;
   const batch=pending.slice(0,8),nonce=createHash('sha256').update(guildId+':'+batch.map(g=>g.id).sort().join(',')).digest('hex').slice(0,24);
   const payload=message(batch.map(g=>'• **'+clean(g.name)+'**').join('\n')+'\n\nLaunch from the homepage. Requirements and availability vary.',{title:'Just added to Pixel Arcade',button:'See new games'}).data;
   const r=await fetcher('https://discord.com/api/v10/channels/'+announcementChannel+'/messages',{method:'POST',headers:{Authorization:'Bot '+token,'Content-Type':'application/json'},body:JSON.stringify({...payload,nonce,enforce_nonce:true}),signal:AbortSignal.timeout(5000)});if(!r.ok)return;
   for(const g of batch)db.prepare('INSERT OR IGNORE INTO discord_announcements VALUES(?,?,?)').run(guildId,g.id,now());db.prepare("INSERT INTO discord_bot_state VALUES('announcement-last',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(now()));await flush();
  }finally{checking=false}
 }
 return{handle,announce,configured,stop(){stopped=true}};
}
