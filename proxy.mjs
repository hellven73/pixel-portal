import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {server as wisp,logging} from '@mercuryworkshop/wisp-js/server';
import {scramjetPath} from '@mercuryworkshop/scramjet/path';
import {libcurlPath} from '@mercuryworkshop/libcurl-transport';
import {baremuxPath} from '@mercuryworkshop/bare-mux/node';
const root=dirname(fileURLToPath(import.meta.url)),epoxyPath=dirname(fileURLToPath(import.meta.resolve('@mercuryworkshop/epoxy-transport')));
export function verifyTicket(ticket,secret){try{if(!secret||typeof ticket!=='string'||ticket.length>1024)return false;const[payload,signature]=ticket.split('.');const expected=createHmac('sha256',secret).update(payload).digest();const actual=Buffer.from(signature||'','base64url');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return false;const data=JSON.parse(Buffer.from(payload,'base64url'));const now=Math.floor(Date.now()/1000);return Number.isSafeInteger(data.sub)&&Number.isSafeInteger(data.exp)&&data.exp>now&&data.exp<=now+3600;}catch{return false;}}
export function createBrowserServer(options={}){
 const secret=options.secret??process.env.PROXY_SHARED_SECRET;if(!secret||secret.length<32)throw new Error('Set PROXY_SHARED_SECRET to a random value of at least 32 characters.');
 logging.set_level(logging.WARN);Object.assign(wisp.options,{dns_result_order:'ipv4first',allow_udp_streams:false,allow_private_ips:false,allow_loopback_ips:false,allow_direct_ip:false,port_whitelist:[80,443],stream_limit_total:32,stream_limit_per_host:12});
 const server=createServer(async(req,res)=>{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','cross-origin');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 try{
 const url=new URL(req.url,'http://proxy.invalid');if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}');}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
 const paths=[['/scram/',scramjetPath],['/libcurl/',libcurlPath],['/epoxy/',epoxyPath],['/baremux/',baremuxPath]];let path=null;
 for(const[prefix,base]of paths)if(url.pathname.startsWith(prefix)){const file=resolve(base,decodeURIComponent(url.pathname.slice(prefix.length)));if(!file.startsWith(resolve(base)+sep)){res.writeHead(403);return res.end();}path=file;}
 if(['/','/browser.html'].includes(url.pathname))path=resolve(root,'browser.html');if(['/browser.js','/sw.js'].includes(url.pathname))path=resolve(root,url.pathname.slice(1));
 if(!path){res.writeHead(404);return res.end('Not found');}
 let data=await readFile(path);
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.json':'application/json','.map':'application/json'}[extname(path)]||'application/octet-stream';res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','Service-Worker-Allowed':'/'});res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404);res.end('Not found');}
 });
 server.on('upgrade',(req,socket,head)=>{
 const url=new URL(req.url,'http://proxy.invalid');const origin=req.headers.origin;const ticket=url.pathname.match(/^\/wisp\/([^/]+)\/$/)?.[1];
 if(!ticket||!verifyTicket(ticket,secret)||(origin!==`https://${req.headers.host}`&&origin!==`http://${req.headers.host}`)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
 const expiry=JSON.parse(Buffer.from(ticket.split('.')[0],'base64url')).exp*1000-Date.now();const timeout=setTimeout(()=>socket.end(),expiry);socket.on('close',()=>clearTimeout(timeout));req.url='/wisp/';wisp.routeRequest(req,socket,head);
 });return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const server=createBrowserServer();server.listen(Number(process.env.PORT)||8081,'0.0.0.0',()=>console.log('Pixel browser service listening'));}
