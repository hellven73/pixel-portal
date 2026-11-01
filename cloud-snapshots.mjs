// Durable snapshots for the two existing SQLite databases, backed by Neon PostgreSQL.
// SQL within the Arcade remains SQLite-compatible. Only completed HTTP responses are
// acknowledged after their corresponding database snapshot has been written to Neon.
import pg from 'pg';
import {gzipSync,gunzipSync} from 'node:zlib';

const {Client}=pg;
const MAX_IMAGE_BYTES=32*1024*1024;
const getChanges=db=>db?Number(db.prepare('SELECT total_changes() AS count').get().count):null;
const serialize=db=>{
 if(!db)return null;
 if(typeof db.serialize!=='function')throw Error('SQLite serialization requires Node.js 24.16 or newer.');
 const image=Buffer.from(db.serialize());
 if(image.length>MAX_IMAGE_BYTES)throw Error('Pixel Arcade data exceeded the cloud snapshot limit.');
 return gzipSync(image);
};

export async function openCloudSnapshots(connectionString){
 const client=new Client({connectionString,connectionTimeoutMillis:12000,query_timeout:20000,application_name:'pixel-arcade'});
 await client.connect();
 try{
  await client.query(`CREATE TABLE IF NOT EXISTS pixel_sqlite_snapshots(
    name TEXT PRIMARY KEY,
    image BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const {rows}=await client.query("SELECT name,image FROM pixel_sqlite_snapshots WHERE name IN ('portal','arcade')");
  const snapshots={portal:null,arcade:null};
  for(const row of rows){
   const image=gunzipSync(row.image,{maxOutputLength:MAX_IMAGE_BYTES});
   if(image.subarray(0,16).toString('utf8')!=='SQLite format 3\0')throw Error('Cloud SQLite snapshot is invalid.');
   snapshots[row.name]=image;
  }
  let last={portal:null,arcade:null},tail=Promise.resolve(),failed=null;
  async function flushIfChanged(portal,arcade){
   if(failed)throw failed;
   const current={portal:getChanges(portal),arcade:getChanges(arcade)};
   if(current.portal===last.portal&&current.arcade===last.arcade)return tail;
   const entries=[['portal',serialize(portal)],['arcade',serialize(arcade)]].filter(([,image])=>image);
   last=current;
   tail=tail.then(async()=>{
    await client.query('BEGIN');
    try{
     for(const [name,image] of entries){
      await client.query(`INSERT INTO pixel_sqlite_snapshots(name,image,updated_at)
       VALUES($1,$2,NOW()) ON CONFLICT(name) DO UPDATE SET image=EXCLUDED.image,updated_at=NOW()`,[name,image]);
     }
     await client.query('COMMIT');
    }catch(error){
     try{await client.query('ROLLBACK')}catch{}
     throw error;
    }
   });
   try{await tail}catch(error){failed=error;throw error}
  }
  async function close(){try{await tail}catch{}await client.end()}
  return{snapshots,flushIfChanged,close};
 }catch(error){await client.end().catch(()=>{});throw error}
}
