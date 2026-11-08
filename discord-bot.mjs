import {createPublicKey,verify,createHash,randomUUID} from 'node:crypto';
const site='https://pixelarcade.com.au/arcade/';
const mirror='https://hellven73.github.io/pixel/arcade/';
export const commands=[
 {name:'game',description:'Find your next game on Pixel Arcade',options:[{type:3,name:'name',description:'Search for a game (leave empty for a suggestion)',max_length:80}]},
 {name:'request-game',description:'Suggest a game for Pixel Arcade',options:[{type:3,name:'title',description:'Game title',required:true,min_length:2,max_length:80},{type:3,name:'note',description:'Why would you like it?',max_length:400}]},
 {name:'new-games',description:'See the newest Pixel Arcade arrivals'},
 {name:'guide',description:'Learn how to use Pixel Arcade and its bot'},
 {name:'setup-announcements',description:'Create or connect the Pixel Arcade updates channel',default_member_permissions:null}
].map(c=>({...c,type:1,contexts:[0],integration_types:[0]}));
const clean=s=>String(s||'').replace(/[@`*_~<>\\]/g,'').trim();
const message=(description,{title='Pixel Arcade',url=site+'#home',button='Visit Pixel Arcade',privateReply=false}={})=>({type:4,data:{...(privateReply?{flags:64}:{}),allowed_mentions:{parse:[]},embeds:[{title,description,color:0xAA92F4}],components:[{type:1,components:[{type:2,style:5,label:button,url},{type:2,style:5,label:'GitHub mirror',url:mirror}]}]}});
export function verifyInteraction(raw,signature,timestamp,key,now=Date.now()){
 if(!/^[a-f\d]{128}$/i.test(signature||'')||!/^\d{10,11}$/.test(timestamp||'')||!/^[a-f\d]{64}$/i.test(key||'')||Math.abs(now/1000-Number(timestamp))>300)return false;
 try{return verify(null,Buffer.concat([Buffer.from(timestamp),raw]),createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(key,'hex')]),format:'der',type:'spki'}),Buffer.from(signature,'hex'))}catch{return false}
}
export function createDiscordBot({db,publicKey,applicationId,guildId,ownerId='',getGames,getArrivals,token='',announcementChannel='',flush=async()=>{},fetcher=fetch,now=Date.now}){
 db.exec(`CREATE TABLE IF NOT EXISTS game_requests(id TEXT PRIMARY KEY,title TEXT,description TEXT,owner TEXT,state TEXT,created REAL);
 CREATE TABLE IF NOT EXISTS game_request_votes(request TEXT,owner TEXT,PRIMARY KEY(request,owner));
 CREATE TABLE IF NOT EXISTS discord_interactions(id TEXT PRIMARY KEY,response TEXT,created REAL);
 CREATE TABLE IF NOT EXISTS discord_announcements(guild TEXT,game TEXT,created REAL,PRIMARY KEY(guild,game));
 CREATE TABLE IF NOT EXISTS discord_bot_state(key TEXT PRIMARY KEY,value TEXT);`);
 let checking=false,stopped=false;const configured=!!publicKey&&!!applicationId&&!!guildId;
 const getState=key=>db.prepare('SELECT value FROM discord_bot_state WHERE key=?').get(key+':'+guildId)?.value;
 const setState=(key,value)=>db.prepare('INSERT INTO discord_bot_state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key+':'+guildId,String(value));
 function guide(){return message('**Start here:** '+site+'\n**Alternative address:** '+mirror+'\nNetwork restrictions still apply.\n\n**/game** — Search for a game or get a suggestion.\n**/request-game** — Suggest a game for the website.\n**/new-games** — See recent additions.\n**/guide** — Show this guide.\n\nPlay, earn XP and unlock achievements. Sign in to sync progress and claim reward titles. Guests keep progress in their browser. Use Friends & DMs to connect; activity sharing is optional.\n\nIn game controls, use Report bug or Update status when something breaks. Some games need separate accounts or your own game files. Only the bot owner can configure announcements.',{title:'Pixel Arcade · Start here',button:'Open Pixel Arcade'})}
 async function postGuide(channel){if(getState('guide:'+channel)||!token)return;const r=await fetcher('https://discord.com/api/v10/channels/'+channel+'/messages',{method:'POST',headers:{Authorization:'Bot '+token,'Content-Type':'application/json'},body:JSON.stringify({...guide().data,nonce:createHash('sha256').update('guide:'+guildId+':'+channel).digest('hex').slice(0,24),enforce_nonce:true}),signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Channel connected, but the guide could not be posted. Check Send Messages and Embed Links permissions.');setState('guide:'+channel,1);await flush()}
 let channelSetup=null;
 function setupChannel(){if(channelSetup)return channelSetup;const task=(async()=>{
  if(!token)throw Error('The owner needs to add DISCORD_BOT_TOKEN in Render first.');
  const headers={Authorization:'Bot '+token,'Content-Type':'application/json'};
  const saved=db.prepare('SELECT value FROM discord_bot_state WHERE key=?').get('channel:'+guildId)?.value;
  let chosen=announcementChannel||saved;
  if(chosen){const r=await fetcher('https://discord.com/api/v10/channels/'+chosen,{headers,signal:AbortSignal.timeout(5000)});if(r.ok){const c=await r.json();if(c.guild_id===guildId&&c.type===0){announcementChannel=c.id;await postGuide(c.id);return c.id}}if(announcementChannel)throw Error('The configured announcement channel is unavailable or belongs to another server.');chosen=null;}
  const r=await fetcher('https://discord.com/api/v10/guilds/'+guildId+'/channels',{headers,signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Install the bot in your server with Manage Channels permission, then retry.');const channels=await r.json();let channel=channels.find(c=>c.type===0&&c.name==='pixel-arcade-updates');
  if(!channel){const me=await fetcher('https://discord.com/api/v10/users/@me',{headers,signal:AbortSignal.timeout(5000)});if(!me.ok)throw Error('The bot token could not be verified.');const bot=await me.json();if(!/^\d{16,22}$/.test(bot.id||''))throw Error('Invalid bot account.');
   const made=await fetcher('https://discord.com/api/v10/guilds/'+guildId+'/channels',{method:'POST',headers,body:JSON.stringify({name:'pixel-arcade-updates',type:0,topic:'New games and updates from Pixel Arcade · https://pixelarcade.com.au',permission_overwrites:[{id:guildId,type:0,allow:'1024',deny:'2048'},{id:bot.id,type:1,allow:'19456',deny:'0'}]}),signal:AbortSignal.timeout(5000)});if(!made.ok)throw Error('Could not create the channel. Give the bot Manage Channels permission and retry.');channel=await made.json();}
  if(channel.guild_id!==guildId||!/^\d{16,22}$/.test(channel.id||''))throw Error('Invalid channel response.');
  db.prepare('INSERT INTO discord_bot_state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('channel:'+guildId,channel.id);announcementChannel=channel.id;
  if(!getState('announcement-baseline')){for(const g of getArrivals())db.prepare('INSERT OR IGNORE INTO discord_announcements VALUES(?,?,?)').run(guildId,g.id,now());setState('announcement-baseline','1');}await flush();await postGuide(channel.id);return channel.id;
 })();channelSetup=task;return task.finally(()=>{if(channelSetup===task)channelSetup=null})}
 async function handle(raw,headers){
  if(!configured)return{status:503,body:{error:'Discord integration is not configured.'}};
  if(!verifyInteraction(raw,headers['x-signature-ed25519'],headers['x-signature-timestamp'],publicKey,now()))return{status:401,body:{error:'Invalid Discord signature.'}};
  let i;try{i=JSON.parse(raw)}catch{return{status:400,body:{error:'Invalid interaction.'}}}
  if(i.application_id!==applicationId)return{status:401,body:{error:'Wrong application.'}};
  if(i.type===1)return{status:200,body:{type:1}};
  if(i.type!==2||i.guild_id!==guildId||!/^\d{16,22}$/.test(i.member?.user?.id||'')||!/^\d{16,22}$/.test(i.id||''))return{status:403,body:message('This bot is available in its configured server only.',{privateReply:true})};
  const prior=db.prepare('SELECT response FROM discord_interactions WHERE id=?').get(i.id);if(prior){await flush();return{status:200,body:JSON.parse(prior.response)}};
  if(i.data?.name==='setup-announcements'){
   if(i.member.user.id!==(typeof ownerId==='function'?ownerId():ownerId))return{status:200,body:message('Only the Pixel Arcade bot owner can set up announcements.',{privateReply:true})};
   if(!token)return{status:200,body:message('The owner needs to add the bot token in Render before setup can run.',{privateReply:true})};
   if(!/^[A-Za-z0-9._-]{20,300}$/.test(i.token||''))return{status:400,body:{error:'Invalid interaction token.'}};
   return{status:200,body:{type:5,data:{flags:64}},after:async()=>{let content;try{const id=await setupChannel();content='Announcements are connected to <#'+id+'>. Only future additions will be announced; no mass pings.'}catch(e){content=e.message}const r=await fetcher('https://discord.com/api/v10/webhooks/'+applicationId+'/'+i.token+'/messages/@original',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Could not update the setup response.')}};
  }
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
  }else if(i.data?.name==='guide'){result=guide();
  }else if(i.data?.name==='new-games'){
   const arrivals=getArrivals();result=message(arrivals.length?arrivals.slice(0,8).map(g=>'• **'+clean(g.name)+'**').join('\n')+'\n\nOpen the homepage for launch buttons. Some games need separate accounts or your own game files.':'No recent additions. Explore the game library instead.',{title:'New on Pixel Arcade',button:'See new games'});
  }else result=message('Try /game, /request-game, or /new-games.',{privateReply:true});
  db.prepare('INSERT INTO discord_interactions VALUES(?,?,?)').run(i.id,JSON.stringify(result),now());db.prepare('DELETE FROM discord_interactions WHERE created<?').run(now()-86400000);await flush();return{status:200,body:result};
 }
 async function announce(){
  if(stopped||checking||!configured||!token)return;checking=true;
  try{
   if(!announcementChannel){announcementChannel=db.prepare('SELECT value FROM discord_bot_state WHERE key=?').get('channel:'+guildId)?.value||'';if(!announcementChannel)return}
   const arrivals=getArrivals();const initialized=getState('announcement-baseline');
   if(!initialized){for(const g of arrivals)db.prepare('INSERT OR IGNORE INTO discord_announcements VALUES(?,?,?)').run(guildId,g.id,now());setState('announcement-baseline','1');await flush();return}
   const pending=arrivals.filter(g=>!db.prepare('SELECT game FROM discord_announcements WHERE guild=? AND game=?').get(guildId,g.id));if(!pending.length)return;
   const last=Number(getState('announcement-last')||0);if(now()-last<86400000)return;
   // Verify the configured channel belongs to the allowed server before any post.
   const channel=await fetcher('https://discord.com/api/v10/channels/'+announcementChannel,{headers:{Authorization:'Bot '+token},signal:AbortSignal.timeout(5000)});if(!channel.ok)return;const data=await channel.json();if(data.guild_id!==guildId||data.type!==0)return;
   const batch=pending.slice(0,8),nonce=createHash('sha256').update(guildId+':'+batch.map(g=>g.id).sort().join(',')).digest('hex').slice(0,24);
   const payload=message(batch.map(g=>'• **'+clean(g.name)+'**').join('\n')+'\n\nLaunch from the homepage. Requirements and availability vary.',{title:'Just added to Pixel Arcade',button:'See new games'}).data;
   const r=await fetcher('https://discord.com/api/v10/channels/'+announcementChannel+'/messages',{method:'POST',headers:{Authorization:'Bot '+token,'Content-Type':'application/json'},body:JSON.stringify({...payload,nonce,enforce_nonce:true}),signal:AbortSignal.timeout(5000)});if(!r.ok)return;
   for(const g of batch)db.prepare('INSERT OR IGNORE INTO discord_announcements VALUES(?,?,?)').run(guildId,g.id,now());setState('announcement-last',now());await flush();
  }finally{checking=false}
 }
 return{handle,announce,setupChannel,configured,stop(){stopped=true}};
}

// Each signed guild interaction gets an isolated channel configuration. Owner identity
// is resolved only from the configured home server, never from the invoking server.
export function createDiscordHub(options){
 const {db,publicKey,applicationId,guildId:homeGuild,token='',fetcher=fetch}=options;const bots=new Map();let owner='',ownerPending=null;
 db.exec('CREATE TABLE IF NOT EXISTS discord_bot_state(key TEXT PRIMARY KEY,value TEXT)');
 owner=db.prepare('SELECT value FROM discord_bot_state WHERE key=?').get('bot-owner:'+applicationId)?.value||'';
 async function ready(){if(owner)return owner;if(ownerPending)return ownerPending;ownerPending=(async()=>{if(!token)return '';const r=await fetcher('https://discord.com/api/v10/guilds/'+homeGuild,{headers:{Authorization:'Bot '+token},signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Cannot verify the bot owner from the home server.');const g=await r.json();if(g.id!==homeGuild||!/^\d{16,22}$/.test(g.owner_id||''))throw Error('Invalid owner response.');owner=g.owner_id;db.prepare('INSERT INTO discord_bot_state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('bot-owner:'+applicationId,owner);await options.flush?.();console.log('Discord bot owner verified.');return owner})();try{return await ownerPending}finally{ownerPending=null}}
 function bot(id){if(!bots.has(id))bots.set(id,createDiscordBot({...options,guildId:id,ownerId:()=>owner,announcementChannel:id===homeGuild?options.announcementChannel:''}));return bots.get(id)}
 return{configured:!!publicKey&&!!applicationId&&!!homeGuild,ready,setupChannel:async()=>{await ready();return bot(homeGuild).setupChannel()},handle:async(raw,headers)=>{
  if(!publicKey||!applicationId||!homeGuild)return{status:503,body:{error:'Discord integration is not configured.'}};
  if(!verifyInteraction(raw,headers['x-signature-ed25519'],headers['x-signature-timestamp'],publicKey,(options.now||Date.now)()))return{status:401,body:{error:'Invalid Discord signature.'}};
  let i;try{i=JSON.parse(raw)}catch{return{status:400,body:{error:'Invalid interaction.'}}}if(i.application_id!==applicationId)return{status:401,body:{error:'Wrong application.'}};if(i.type===1)return{status:200,body:{type:1}};
  if(!/^\d{16,22}$/.test(i.guild_id||'')||i.member?.user?.bot)return{status:403,body:message('Use this bot in a server where it is installed.',{privateReply:true})};
  const authorized=i.authorizing_integration_owners?.['0'];if(authorized&&authorized!==i.guild_id)return{status:403,body:{error:'Wrong installation context.'}};
  if(options.defer===false)return bot(i.guild_id).handle(raw,headers);
  if(i.type!==2||!/^\d{16,22}$/.test(i.id||'')||!/^\d{16,22}$/.test(i.member?.user?.id||'')||!/^[-A-Za-z0-9._]{20,300}$/.test(i.token||''))return{status:400,body:{error:'Invalid interaction.'}};
  const privateReply=!['game','guide','new-games'].includes(i.data?.name);
  return{status:200,body:{type:5,data:privateReply?{flags:64}:{}},after:async()=>{let result;try{result=await bot(i.guild_id).handle(raw,headers);if(result.after){await result.after();return}}catch{result={body:message('The service is temporarily unavailable. Please retry shortly.',{privateReply:true})}}const data=result.body?.data||{content:'The command could not complete. Please retry.'};const {flags,...payload}=data;const r=await fetcher('https://discord.com/api/v10/webhooks/'+applicationId+'/'+i.token+'/messages/@original',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Could not deliver the command response.')}};
 },announce:async()=>{if(!owner)await ready();const rows=db.prepare("SELECT key FROM discord_bot_state WHERE key LIKE 'channel:%'").all();for(const r of rows){const id=r.key.slice(8);if(/^\d{16,22}$/.test(id))try{await bot(id).announce()}catch{console.error('Discord server announcement check failed.')}}},stop(){for(const b of bots.values())b.stop()}};
}
