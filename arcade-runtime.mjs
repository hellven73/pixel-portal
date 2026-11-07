import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const exec=promisify(execFile),root=dirname(fileURLToPath(import.meta.url));
let sourceReady;
export function prepareArcade(){return sourceReady??=prepare();}
async function prepare(){
 const manifest=JSON.parse(await readFile(join(root,'arcade-manifest.json'),'utf8'));
 const local=join(root,'arcade-source'),runtime=join(root,'.arcade-app');
 let directory=local;
 try{await access(join(local,'backend-worker.mjs'));}catch{
  directory=runtime;const archive=join(root,'arcade-app.tar.gz');
  const bytes=await readFile(archive);if(createHash('sha256').update(bytes).digest('hex')!==manifest.archiveSha256)throw Error('Arcade bundle checksum mismatch.');
  const {stdout}=await exec('tar',['-tzf',archive]);
  if(stdout.trim().split('\n').some(name=>!/^\.\/[\w.-]+$/.test(name)&&name!=='./'))throw Error('Invalid arcade bundle path.');
  await mkdir(runtime,{recursive:true});await exec('tar',['-xzf',archive,'-C',runtime,'--no-same-owner']);
 }
 const overrides=JSON.parse(await readFile(join(root,'arcade-overrides.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return '{}';throw error;}));
 for(const [name,content]of Object.entries(overrides.files||{})){
  if(!['apps.js','scramjet-home.js'].includes(name)||!manifest.files.includes(name)||typeof content!=='string')throw Error('Invalid Arcade source override.');
  await writeFile(join(directory,name),content);
 }
 for(const name of ['index.html','arcade.html']){
  let html=await readFile(join(directory,name),'utf8');
  for(const [before,after]of Object.entries(overrides.versions||{}))html=html.replaceAll(before,after);
  await writeFile(join(directory,name),html);
 }
 let workerText=await readFile(join(directory,'backend-worker.mjs'),'utf8');
 if(!workerText.includes("import {engagement} from '../engagement-api.mjs'")){
  workerText="import {engagement} from '../engagement-api.mjs';\n"+workerText;
  const marker='const fn=routes[endpoint]?.[request.method];';
  if(!workerText.includes(marker))throw Error('Arcade engagement route marker missing.');
  workerText=workerText.replace(marker,"if(endpoint==='/api/engagement')return engagement(request,{DB:env.DB,getAccount,sameOrigin,isAdmin,limited,json});\n"+marker);
  await writeFile(join(directory,'backend-worker.mjs'),workerText);
 }
 const worker=(await import(pathToFileURL(join(directory,'backend-worker.mjs')).href)).default;
 return{directory,worker,files:new Set(manifest.files.filter(name=>!['native-games.html','native-games.js','table-games.html','table-games.js','chess-app.js','chess-worker.js'].includes(name)&&!name.startsWith('backend-')&&!name.endsWith('.test.mjs')&&!name.endsWith('.ts')&&!name.endsWith('.sql')))};
}
export async function createArcade({dbPath,legacyDb,restoreSnapshot,adminUsername=process.env.PIXEL_ADMIN_USERNAME||'',...extra}={}){
 const source=await prepareArcade();
 if(dbPath!==':memory:')await mkdir(dirname(dbPath),{recursive:true});
 const db=new DatabaseSync(dbPath);if(restoreSnapshot)db.deserialize(restoreSnapshot);db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
 const initialized=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='arcade_accounts'").get();
 if(!initialized){db.exec('BEGIN IMMEDIATE');try{db.exec(await readFile(join(source.directory,'backend-schema.sql'),'utf8'));db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');db.close();throw error;}}
 function statement(sql,params=[]){
  const query=db.prepare(sql);const run=()=>{const result=query.run(...params);return{success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};};
  return{bind:(...values)=>statement(sql,values),first:async column=>{const row=query.get(...params);return row?(column?row[column]:{...row}):null;},all:async()=>({success:true,results:query.all(...params).map(row=>({...row}))}),run:async()=>run(),execute:run};
 }
 const DB={prepare:statement,batch:async statements=>{db.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.execute());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}};
 // Copy current Portal accounts once without exporting private data. Existing passwords remain valid.
 if(legacyDb){db.exec('CREATE TABLE IF NOT EXISTS portal_imports(id INTEGER PRIMARY KEY)');
  for(const user of legacyDb.prepare('SELECT * FROM users').all()){
   if(db.prepare('SELECT id FROM portal_imports WHERE id=?').get(user.id))continue;
   const uid='portal:'+user.id,username=user.username.toLowerCase();
   db.exec('BEGIN IMMEDIATE');try{
    if(!db.prepare('SELECT user_id FROM arcade_accounts WHERE username=?').get(username)){
     db.prepare('INSERT INTO arcade_accounts VALUES(?,?,?,?,?)').run(uid,username,user.password_hash,'scrypt$'+user.salt,user.created_at);
     db.prepare('INSERT INTO players VALUES(?,?,?)').run(uid,user.username,user.created_at);
     db.prepare('INSERT INTO market_wallets VALUES(?,0)').run(uid);
     if(user.coins)db.prepare('INSERT INTO market_ledger VALUES(?,?,?,?,?,?)').run('portal-import:'+uid,uid,user.coins,'migration','Existing Portal coin balance',Date.now());
    }
    db.prepare('INSERT INTO portal_imports VALUES(?)').run(user.id);db.exec('COMMIT');
   }catch(error){db.exec('ROLLBACK');throw error;}
  }
 }
 const env={DB,PIXEL_ADMIN_USERNAME:adminUsername,FRAMEX_PASSWORD_HASH:process.env.FRAMEX_PASSWORD_HASH,FRAMEX_PASSWORD_SALT:process.env.FRAMEX_PASSWORD_SALT,FRAMEX_SESSION_KEY:process.env.FRAMEX_SESSION_KEY,...extra};
 return{...source,db,fetch:request=>source.worker.fetch(request,env),close:()=>db.close()};
}
