import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdir,access} from 'node:fs/promises';
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
 const worker=(await import(pathToFileURL(join(directory,'backend-worker.mjs')).href)).default;
 return{directory,worker,files:new Set(manifest.files.filter(name=>!['native-games.html','native-games.js','table-games.html','table-games.js','chess-app.js','chess-worker.js'].includes(name)&&!name.startsWith('backend-')&&!name.endsWith('.test.mjs')&&!name.endsWith('.ts')&&!name.endsWith('.sql')))};
}
export async function createArcade({dbPath,legacyDb,adminUsername=process.env.PIXEL_ADMIN_USERNAME||'',...extra}={}){
 const source=await prepareArcade();
 if(dbPath!==':memory:')await mkdir(dirname(dbPath),{recursive:true});
 const db=new DatabaseSync(dbPath);db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
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
