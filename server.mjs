import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,scrypt as scryptCb,timingSafeEqual,createHmac} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile,mkdir} from 'node:fs/promises';
import {dirname,extname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createArcade,prepareArcade} from './arcade-runtime.mjs';
import {remoteArcade} from './remote-arcade.mjs';
const scrypt=promisify(scryptCb),root=dirname(fileURLToPath(import.meta.url));
export const products=JSON.parse(await readFile(join(root,'shop-data.json'),'utf8'));
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new HttpError(status,message);};
const sha=x=>createHash('sha256').update(x).digest('hex');
const clean=(v,max=1000)=>typeof v==='string'?v.trim().slice(0,max):'';
const publicUser=row=>row?{id:row.id,username:row.username,coins:row.coins,frame:row.frame,badge:row.badge,nameColor:row.name_color,profileEffect:row.profile_effect||null,plusUntil:row.plus_until||0}:null;
export async function createPortal(options={}){
 const dbPath=options.dbPath||process.env.DB_PATH||join(root,'data','portal.sqlite');
 if(dbPath!==':memory:')await mkdir(dirname(dbPath),{recursive:true});
 const db=new DatabaseSync(dbPath);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT NOT NULL COLLATE NOCASE UNIQUE,password_hash TEXT NOT NULL,salt TEXT NOT NULL,coins INTEGER NOT NULL DEFAULT 2500 CHECK(coins>=0),frame TEXT,badge TEXT,name_color TEXT,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY,room TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id),body TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS message_room ON messages(room,id);
 CREATE TABLE IF NOT EXISTS inventory(user_id INTEGER NOT NULL REFERENCES users(id),item_id TEXT NOT NULL,purchased_at INTEGER NOT NULL,PRIMARY KEY(user_id,item_id));
 CREATE TABLE IF NOT EXISTS daily_claims(user_id INTEGER NOT NULL REFERENCES users(id),day TEXT NOT NULL,PRIMARY KEY(user_id,day));
 CREATE TABLE IF NOT EXISTS saves(user_id INTEGER NOT NULL REFERENCES users(id),key TEXT NOT NULL,value TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,key));
 CREATE TABLE IF NOT EXISTS ai_usage(user_id INTEGER NOT NULL REFERENCES users(id),day TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,day));`);
 const columns=db.prepare('PRAGMA table_info(users)').all().map(x=>x.name);if(!columns.includes('profile_effect'))db.exec('ALTER TABLE users ADD COLUMN profile_effect TEXT');if(!columns.includes('plus_until'))db.exec('ALTER TABLE users ADD COLUMN plus_until INTEGER NOT NULL DEFAULT 0');
 const statement=sql=>db.prepare(sql),now=()=>Date.now();
 const activeUsers=new Map();const limits=new Map(),roomNames=['general','gaming','help'];
 let catalogue=JSON.parse(await readFile(join(root,'catalogue.json'),'utf8'));
 const config={proxyOrigin:options.proxyOrigin??process.env.PROXY_ORIGIN??(process.env.PROXY_HOSTNAME?'https://'+process.env.PROXY_HOSTNAME:''),proxySecret:options.proxySecret??process.env.PROXY_SHARED_SECRET??'',aiBase:options.aiBase??process.env.AI_BASE_URL??'',aiKey:options.aiKey??process.env.AI_API_KEY??'',aiModel:options.aiModel??process.env.AI_MODEL??'',allowLocalAI:process.env.AI_ALLOW_LOCAL==='1'};
 const arcadeApiOrigin=options.arcadeApiOrigin??process.env.ARCADE_API_ORIGIN;
 const arcade=arcadeApiOrigin?{...await prepareArcade(),fetch:remoteArcade({origin:arcadeApiOrigin,fetcher:options.arcadeFetch,serviceAuthorization:options.arcadeServiceAuthorization??process.env.ARCADE_SERVICE_AUTHORIZATION}),close:()=>{}}:await createArcade({dbPath:options.arcadeDbPath||(dbPath===':memory:'?':memory:':join(dirname(dbPath),'arcade.sqlite')),legacyDb:db,adminUsername:options.adminUsername});
 const aiReady=Boolean(config.aiBase&&config.aiModel&&(config.aiKey||config.allowLocalAI||options.aiFetch));
 const allowedFiles=new Set(['index.html','app.js','services.js','style.css','game-policy.js','icon.svg','catalogue.json','shop-data.json','webports.json','community.js','loading-screen.css','loading-screen.js']);
 function limit(key,max=30,window=60000){const current=limits.get(key);if(!current||now()-current.start>window){limits.set(key,{start:now(),n:1});return;}if(++current.n>max)fail(429,'Too many requests. Try again in a moment.');}
 const sweep=setInterval(()=>{for(const[id,seen]of activeUsers)if(now()-seen>75000)activeUsers.delete(id);for(const[key,v]of limits)if(now()-v.start>3600000)limits.delete(key);statement('DELETE FROM sessions WHERE expires<?').run(now());},60000);sweep.unref();
 function userFor(req){const match=(req.headers.cookie||'').match(/(?:^|;\s*)pixel_session=([a-f0-9]{64})(?:;|$)/);if(!match)return null;return statement('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.hash=? AND s.expires>?').get(sha(match[1]),now())||null;}
 function requireUser(req){const u=userFor(req);if(!u)fail(401,'Sign in to use this feature.');return u;}
 function csrf(req){if(['GET','HEAD','OPTIONS'].includes(req.method))return;const origin=req.headers.origin;if(!origin)fail(403,'The request needs an origin.');const expected=options.origin||process.env.APP_ORIGIN;const additional=options.origins||process.env.APP_ORIGINS;const allowed=additional?additional.split(',').map(value=>value.trim()).filter(Boolean):expected?[expected]:null;let originHost;try{originHost=new URL(origin).host;}catch{fail(403,'Invalid request origin.');}if(allowed?!allowed.includes(origin):originHost!==req.headers.host)fail(403,'This request came from a different site.');}
 async function body(req,max=65536){if(!(req.headers['content-type']||'').startsWith('application/json'))fail(415,'Send application/json.');let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max)fail(413,'This request is too large.');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'Invalid JSON.');}}
 function json(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));}
 function session(res,user,req){const token=randomBytes(32).toString('hex');statement('INSERT INTO sessions(hash,user_id,expires) VALUES(?,?,?)').run(sha(token),user.id,now()+7*86400000);const secure=process.env.COOKIE_SECURE==='1'||req.socket.encrypted;res.setHeader('Set-Cookie',`pixel_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure?'; Secure':''}`);}
 function memberProfile(row){return{id:row.id,username:row.username,frame:row.frame,badge:row.badge,nameColor:row.name_color,profileEffect:row.profile_effect,plusActive:row.plus_until>now(),joinedAt:row.created_at,online:(activeUsers.get(row.id)||0)>now()-75000};}
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
 const server=createServer(async(req,res)=>{
 if(process.env.COOKIE_SECURE==='1')res.setHeader('Strict-Transport-Security','max-age=15552000');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','credentialless');
 try{
 const url=new URL(req.url,'http://portal.invalid'),path=url.pathname,method=req.method;
 if(path==='/ads.txt'&&['GET','HEAD'].includes(method)){
  res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600'});
  return res.end(method==='HEAD'?undefined:'google.com, pub-8632851454203675, DIRECT, f08c47fec0942fa0\n');
 }
 if((path==='/robots.txt'||path==='/sitemap.xml')&&['GET','HEAD'].includes(method)){
  const payload=path==='/robots.txt'
   ?'User-agent: *\nAllow: /\nDisallow: /arcade-api/\nDisallow: /api/\nSitemap: https://pixelarcade.com.au/sitemap.xml\n'
   :'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://pixelarcade.com.au/</loc></url>\n  <url><loc>https://pixelarcade.com.au/portal</loc></url>\n</urlset>\n';
  res.writeHead(200,{'Content-Type':path==='/robots.txt'?'text/plain; charset=utf-8':'application/xml; charset=utf-8','Cache-Control':'public, max-age=3600'});
  return res.end(method==='HEAD'?undefined:payload);
 }
 if(path.startsWith('/arcade-api/')){
  if(['/arcade-api/party','/arcade-api/challenges'].includes(path))return json(res,410,{error:'This game has been removed.'});
  if(path==='/arcade-api/status'&&method==='GET')return json(res,200,{ok:true,ephemeralStorage:!arcadeApiOrigin&&process.env.STORAGE_MODE==='ephemeral',storage:arcadeApiOrigin?'existing-database':'local',adminConfigured:Boolean(process.env.PIXEL_ADMIN_USERNAME),version:'3.0.0'});
  csrf(req);limit(`arcade:${req.socket.remoteAddress}`,360);const chunks=[];let length=0;
  for await(const chunk of req){length+=chunk.length;if(length>98304)fail(413,'This request is too large.');chunks.push(chunk);}
  const protocol=req.headers['x-forwarded-proto']==='https'||process.env.COOKIE_SECURE==='1'?'https':'http';
  const origin=req.headers.origin||`${protocol}://${req.headers.host}`;
  const headers=new Headers();for(const[key,value]of Object.entries(req.headers))if(value&&key!=='host'&&key!=='content-length')headers.set(key,Array.isArray(value)?value.join(','):value);
  headers.set('cf-connecting-ip',req.socket.remoteAddress||'local');
  const request=new Request(origin+'/api/'+path.slice('/arcade-api/'.length)+url.search,{method,headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})});
  if(path==='/arcade-api/browser-ticket'&&method==='POST'){
   const profile=await arcade.fetch(new Request(origin+'/api/profile',{headers}));if(profile.status!==200)fail(401,'Sign in to use the browser.');
   if(!config.proxyOrigin||!config.proxySecret)fail(503,'The browser server has not been connected yet.');
   const {username}=await profile.json();const sub=parseInt(sha(username).slice(0,12),16),payload=Buffer.from(JSON.stringify({sub,exp:Math.floor(now()/1000)+600,origin})).toString('base64url'),signature=createHmac('sha256',config.proxySecret).update(payload).digest('base64url');
   return json(res,200,{origin:config.proxyOrigin,ticket:`${payload}.${signature}`});
  }
  const response=await arcade.fetch(request);res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(Buffer.from(await response.arrayBuffer()));
 }
 if(path==='/'||path==='/arcade'||path.startsWith('/arcade/')){
  if(!['GET','HEAD'].includes(method))fail(405,'Method not allowed.');
  const file=decodeURIComponent(path==='/'||path==='/arcade'||path==='/arcade/'?'index.html':path.slice(8));
  if(!arcade.files.has(file))fail(404,'Not found.');const data=await readFile(join(arcade.directory,file));
  // Provider sign-in popups need their opener; the separate Scramjet service keeps isolation.
  res.setHeader('Cross-Origin-Opener-Policy','same-origin-allow-popups');res.removeHeader('Cross-Origin-Embedder-Policy');
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.data':'application/octet-stream'}[extname(file)]||'text/plain; charset=utf-8';
  if(file==='index.html'){
   let html=data.toString('utf8');
   if(!html.includes('G-4QH6SB2N2D'))html=html.replace('</head>',"<script async src=\"https://www.googletagmanager.com/gtag/js?id=G-4QH6SB2N2D\"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-4QH6SB2N2D');</script>"+'</head>');
   if(!html.includes('rel="canonical"'))html=html.replace('</head>',"<meta name=\"description\" content=\"Play free browser games at Pixel Arcade. Explore mini games, big games, tools, and community features in one gaming hub.\"><link rel=\"canonical\" href=\"https://pixelarcade.com.au/\"><meta property=\"og:type\" content=\"website\"><meta property=\"og:title\" content=\"Pixel Arcade — Free Browser Games\"><meta property=\"og:description\" content=\"Explore free browser games and gaming tools at Pixel Arcade.\"><meta property=\"og:url\" content=\"https://pixelarcade.com.au/\">"+'</head>');
   // Small first-visit intro, with no external dependencies and a skip button.
   html=html.replace('</head>','<script>try{if(!sessionStorage.getItem("pixel-loader-session-v1"))document.documentElement.classList.add("pixel-loading-enabled")}catch{document.documentElement.classList.add("pixel-loading-enabled")}</script><link rel="stylesheet" href="/loading-screen.css"><script defer src="/loading-screen.js"></script></head>');
   if(method!=='HEAD')html=html.replace('<body>','<body>'+(await readFile(join(root,'loading-screen.html'),'utf8')));
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});
   return res.end(method==='HEAD'?undefined:html);
  }
  res.writeHead(200,{'Content-Type':mime,'Cache-Control':['.html','.js','.mjs','.css'].includes(extname(file))?'no-cache':'public, max-age=3600'});return res.end(method==='HEAD'?undefined:data);
 }
 if(path==='/portal'||path==='/portal/'){
  const html=(await readFile(join(root,'index.html'),'utf8')).replace('<head>','<head><base href="/">');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});return res.end(method==='HEAD'?undefined:html);
 }
 if(path.startsWith('/api/')){
  csrf(req);limit(`all:${req.socket.remoteAddress}`,240);const u=userFor(req);if(u)activeUsers.set(u.id,now());
  if(path==='/api/health'&&method==='GET')return json(res,200,{ok:true,version:'2.1.0',games:catalogue.games.length});
  if(path==='/api/config'&&method==='GET')return json(res,200,{backend:true,chat:true,marketplace:true,ephemeralStorage:process.env.STORAGE_MODE==='ephemeral',proxy:Boolean(config.proxyOrigin&&config.proxySecret),ai:aiReady,aiModel:config.aiModel||null,rooms:roomNames});
  if(path==='/api/users'&&method==='GET'){
   const search=clean(url.searchParams.get('search')||'',24),after=Math.max(0,Number(url.searchParams.get('after'))||0),take=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||50));
   const pattern='%'+search.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_')+'%';
   const rows=statement("SELECT id,username,frame,badge,name_color,profile_effect,plus_until,created_at FROM users WHERE id>? AND username LIKE ? ESCAPE '\\' ORDER BY id LIMIT ?").all(after,pattern,take+1);
   const profiles=rows.slice(0,take).map(memberProfile),total=statement("SELECT COUNT(*) AS n FROM users WHERE username LIKE ? ESCAPE '\\'").get(pattern).n;
   return json(res,200,{users:profiles,total,nextCursor:rows.length>take?profiles.at(-1).id:null});
  }
  if(/^\/api\/users\/\d+$/.test(path)&&method==='GET'){const row=statement('SELECT id,username,frame,badge,name_color,profile_effect,plus_until,created_at FROM users WHERE id=?').get(Number(path.split('/').pop()));if(!row)fail(404,'This profile was not found.');return json(res,200,{profile:memberProfile(row)});}
  if(path==='/api/auth/me'&&method==='GET')return json(res,200,{user:publicUser(u)});
  if(path==='/api/auth/register'&&method==='POST'){
   limit(`register:${req.socket.remoteAddress}`,10,3600000);const b=await body(req);const username=clean(b.username,24);if(!/^[a-zA-Z0-9_]{3,24}$/.test(username))fail(400,'Use 3–24 letters, numbers, or underscores for your username.');if(typeof b.password!=='string'||b.password.length<10||b.password.length>128)fail(400,'Choose a password between 10 and 128 characters.');
   if(statement('SELECT id FROM users WHERE username=?').get(username))fail(409,'That username is already taken.');const salt=randomBytes(16).toString('hex'),hash=Buffer.from(await scrypt(b.password,salt,64)).toString('hex');
   let id;try{id=statement('INSERT INTO users(username,password_hash,salt,coins,created_at) VALUES(?,?,?,2500,?)').run(username,hash,salt,now()).lastInsertRowid;}catch(e){if(String(e).includes('UNIQUE'))fail(409,'That username is already taken.');throw e;}
   const user=statement('SELECT * FROM users WHERE id=?').get(id);activeUsers.set(user.id,now());session(res,user,req);return json(res,201,{user:publicUser(user)});
  }
  if(path==='/api/auth/login'&&method==='POST'){
   limit(`login:${req.socket.remoteAddress}`,30,600000);const b=await body(req),username=clean(b.username,24);if(typeof b.password!=='string'||b.password.length>128)fail(400,'Enter your username and password.');const row=statement('SELECT * FROM users WHERE username=?').get(username);const salt=row?.salt||'00000000000000000000000000000000',hash=Buffer.from(await scrypt(b.password,salt,64));if(!row||!timingSafeEqual(hash,Buffer.from(row.password_hash,'hex')))fail(401,'The username or password is incorrect.');activeUsers.set(row.id,now());session(res,row,req);return json(res,200,{user:publicUser(row)});
  }
  if(path==='/api/auth/logout'&&method==='POST'){if(u)activeUsers.delete(u.id);const token=(req.headers.cookie||'').match(/pixel_session=([a-f0-9]{64})/)?.[1];if(token)statement('DELETE FROM sessions WHERE hash=?').run(sha(token));res.setHeader('Set-Cookie','pixel_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,200,{ok:true});}
  if(path==='/api/games'&&method==='GET')return json(res,200,catalogue);
  if(path==='/api/chat/messages'&&method==='GET'){
   requireUser(req);const room=url.searchParams.get('room')||'general';if(!roomNames.includes(room))fail(404,'Unknown channel.');const after=Number(url.searchParams.get('after'))||0;
   const rows=after?statement('SELECT m.id,m.body,m.created_at,u.id AS user_id,u.username,u.frame,u.badge,u.name_color FROM messages m JOIN users u ON m.user_id=u.id WHERE m.room=? AND m.id>? ORDER BY m.id LIMIT 100').all(room,after):statement('SELECT * FROM (SELECT m.id,m.body,m.created_at,u.id AS user_id,u.username,u.frame,u.badge,u.name_color FROM messages m JOIN users u ON m.user_id=u.id WHERE m.room=? ORDER BY m.id DESC LIMIT 100) ORDER BY id').all(room);
   return json(res,200,{messages:rows});
  }
  if(path==='/api/chat/messages'&&method==='POST'){
   const user=requireUser(req);limit(`message:${user.id}`,15,10000);const b=await body(req),room=clean(b.room||'general',24),text=clean(b.body,2000);if(!roomNames.includes(room))fail(404,'Unknown channel.');if(!text)fail(400,'Write a message first.');const result=statement('INSERT INTO messages(room,user_id,body,created_at) VALUES(?,?,?,?)').run(room,user.id,text,now());return json(res,201,{id:Number(result.lastInsertRowid)});
  }
  if(path.startsWith('/api/chat/messages/')&&method==='DELETE'){
   const user=requireUser(req),id=Number(path.split('/').pop());const row=statement('SELECT user_id FROM messages WHERE id=?').get(id);if(!row)fail(404,'Message not found.');if(row.user_id!==user.id)fail(403,'You can delete only your own messages.');statement('DELETE FROM messages WHERE id=?').run(id);return json(res,200,{ok:true});
  }
  if(path==='/api/shop'&&method==='GET')return json(res,200,{items:products});
  if(path==='/api/inventory'&&method==='GET'){const user=requireUser(req);return json(res,200,{user:publicUser(user),items:statement('SELECT item_id,purchased_at FROM inventory WHERE user_id=?').all(user.id)});}
  if(path==='/api/shop/buy'&&method==='POST'){
   const user=requireUser(req),b=await body(req),product=products.find(x=>x.id===b.itemId);if(!product)fail(404,'Item not found.');transaction(()=>{if(product.kind!=='pass'&&statement('SELECT 1 FROM inventory WHERE user_id=? AND item_id=?').get(user.id,product.id))fail(409,'You already own this item.');const result=statement('UPDATE users SET coins=coins-? WHERE id=? AND coins>=?').run(product.price,user.id,product.price);if(!result.changes)fail(409,'You need more coins for this item.');statement('INSERT INTO inventory(user_id,item_id,purchased_at) VALUES(?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET purchased_at=excluded.purchased_at').run(user.id,product.id,now());if(product.kind==='pass')statement('UPDATE users SET plus_until=MAX(plus_until,?)+? WHERE id=?').run(now(),Number(product.effect)*86400000,user.id);});return json(res,200,{user:publicUser(statement('SELECT * FROM users WHERE id=?').get(user.id)),item:product.id});
  }
  if(path==='/api/shop/equip'&&method==='POST'){
   const user=requireUser(req),b=await body(req),item=products.find(x=>x.id===b.itemId);if(!item)fail(404,'Item not found.');if(!statement('SELECT 1 FROM inventory WHERE user_id=? AND item_id=?').get(user.id,item.id))fail(403,'You do not own this item.');if(item.kind==='pass')fail(400,'Membership passes activate when purchased.');const column={frame:'frame',profile:'profile_effect',badge:'badge',name:'name_color'}[item.kind];statement(`UPDATE users SET ${column}=? WHERE id=?`).run(item.effect,user.id);if(item.kind==='badge')statement('UPDATE users SET name_color=? WHERE id=?').run(item.color,user.id);return json(res,200,{user:publicUser(statement('SELECT * FROM users WHERE id=?').get(user.id))});
  }
  if(path==='/api/wallet/daily'&&method==='POST'){
   const user=requireUser(req),day=new Date().toISOString().slice(0,10);transaction(()=>{if(statement('SELECT 1 FROM daily_claims WHERE user_id=? AND day=?').get(user.id,day))fail(409,'You have already collected today’s coins.');statement('INSERT INTO daily_claims(user_id,day) VALUES(?,?)').run(user.id,day);statement('UPDATE users SET coins=coins+50 WHERE id=?').run(user.id);});return json(res,200,{user:publicUser(statement('SELECT * FROM users WHERE id=?').get(user.id)),amount:50});
  }
  if(path==='/api/saves'&&method==='GET'){const user=requireUser(req);const saves=Object.fromEntries(statement('SELECT key,value FROM saves WHERE user_id=?').all(user.id).map(r=>[r.key,JSON.parse(r.value)]));return json(res,200,{saves});}
  if(path==='/api/saves'&&method==='PUT'){const user=requireUser(req),b=await body(req);if(!['favorites','preferences','note'].includes(b.key))fail(400,'Unknown save type.');const data=JSON.stringify(b.value);if(data===undefined||data.length>40000)fail(400,'This save is too large.');statement('INSERT INTO saves(user_id,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(user.id,b.key,data,now());return json(res,200,{ok:true});}
  if(path==='/api/browser-ticket'&&method==='POST'){
   const user=requireUser(req);if(!config.proxyOrigin||!config.proxySecret)fail(503,'The browser server has not been connected yet.');const payload=Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(now()/1000)+600,origin:req.headers.origin})).toString('base64url'),signature=createHmac('sha256',config.proxySecret).update(payload).digest('base64url');return json(res,200,{origin:config.proxyOrigin,ticket:`${payload}.${signature}`,expiresIn:600});
  }
  if(path==='/api/ai/chat'&&method==='POST'){
   const user=requireUser(req);if(!aiReady)fail(503,'AI is not connected yet. The site owner needs to connect an AI provider.');limit(`ai:${user.id}`,10,3600000);const b=await body(req),messages=Array.isArray(b.messages)?b.messages.slice(-16).map(m=>({role:m.role==='assistant'?'assistant':'user',content:clean(m.content,6000)})).filter(m=>m.content):[];if(!messages.length)fail(400,'Write a message first.');const day=new Date().toISOString().slice(0,10),used=statement('SELECT count FROM ai_usage WHERE user_id=? AND day=?').get(user.id,day)?.count||0;if(used>=30)fail(429,'You have reached today’s AI message limit.');statement('INSERT INTO ai_usage(user_id,day,count) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1').run(user.id,day);
   try{const upstream=await (options.aiFetch||fetch)(config.aiBase.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',...(config.aiKey?{Authorization:`Bearer ${config.aiKey}`}:{})},body:JSON.stringify({model:config.aiModel,messages:[{role:'system',content:'You are Pixel Assistant, a helpful assistant in a personal games and browsing dashboard. Be clear and honest about what you can do.'},...messages],max_tokens:1200,stream:false}),signal:AbortSignal.timeout(45000)});if(!upstream.ok)fail(502,'The AI provider could not complete this request.');const data=await upstream.json(),reply=data.choices?.[0]?.message?.content;if(typeof reply!=='string'||!reply.trim())fail(502,'The AI provider returned an empty response.');return json(res,200,{reply,model:config.aiModel});}catch(e){statement('UPDATE ai_usage SET count=MAX(0,count-1) WHERE user_id=? AND day=?').run(user.id,day);if(e instanceof HttpError)throw e;fail(502,'The AI service could not be reached. Please try again later.');}
  }
  fail(404,'Unknown endpoint.');
 }
 if(!['GET','HEAD'].includes(method))fail(405,'Method not allowed.');let file=decodeURIComponent(path.slice(1)||'index.html');if(!allowedFiles.has(file))fail(404,'Not found.');
 const data=await readFile(join(root,file)),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':mime,'Cache-Control':['.html','.js','.css'].includes(extname(file))?'no-cache':'public, max-age=300'});res.end(method==='HEAD'?undefined:data);
 }catch(e){
  if(res.headersSent){res.end();return;}
  // Browser navigations to missing pages get the themed 404; API and asset callers retain JSON errors.
  const wantsHtml=(req.headers.accept||'').includes('text/html');
  const isApi=(()=>{try{const p=new URL(req.url,'http://portal.invalid').pathname;return p.startsWith('/api/')||p.startsWith('/arcade-api/');}catch{return false;}})();
  if(e.status===404&&['GET','HEAD'].includes(req.method)&&wantsHtml&&!isApi){
   try{
    const html=await readFile(join(root,'404.html'));
    res.writeHead(404,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'});
    return res.end(req.method==='HEAD'?undefined:html);
   }catch(error){console.error('Could not serve 404 page:',error.name);}
  }
  json(res,e.status||500,{error:e.status?e.message:'The server could not complete this request.'});if(!e.status)console.error('Portal request failed:',e.name);
 }
 });
 return{server,db,arcade,close:async()=>{clearInterval(sweep);await new Promise(resolve=>server.close(resolve));arcade.close();db.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const portal=await createPortal();const port=Number(process.env.PORT)||8080;portal.server.listen(port,'0.0.0.0',()=>console.log(`Pixel Portal listening on ${port}`));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>portal.close().then(()=>process.exit(0)));}
