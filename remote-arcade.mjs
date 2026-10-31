// Reuse the owner's existing persistent Arcade service. No database or password export.
const tokenPattern=/^[a-f0-9]{64}$/;
const authPaths=new Set(['/api/auth/login','/api/auth/register']);
const sessionName=request=>['terminal.local','localhost','127.0.0.1'].includes(new URL(request.url).hostname)?'px-preview-session':'__Host-px-session';
const cookies=request=>new Map((request.headers.get('cookie')||'').split(';').map(part=>{const at=part.indexOf('=');return [part.slice(0,at).trim(),part.slice(at+1).trim()];}));
export function remoteArcade({origin,fetcher=fetch,serviceAuthorization='',clientOrigin='https://hellven73.github.io'}={}){
 const upstream=new URL(origin);if(upstream.protocol!=='https:'||upstream.username||upstream.password||upstream.pathname!=='/'||upstream.search||upstream.hash)throw Error('Arcade service must be an HTTPS origin.');
 return async function requestArcade(request){
  const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return Response.json({error:'Invalid service path.'},{status:400});
  const saved=cookies(request),token=saved.get(sessionName(request)),dev=saved.get('px-framex-dev');const headers=new Headers({'Origin':clientOrigin,'X-Pixel-Client':'github-pages','Accept':'application/json'});
  if(serviceAuthorization)headers.set('OAI-Sites-Authorization','Bearer '+serviceAuthorization);
  if(token&&tokenPattern.test(token))headers.set('Authorization','Bearer '+token);
  if(url.pathname==='/api/dev/framex'&&dev&&/^\d+\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(dev))headers.set('X-Pixel-Dev-Token',dev);
  if(request.headers.has('content-type'))headers.set('Content-Type',request.headers.get('content-type'));
  let response;try{response=await fetcher(upstream.origin+url.pathname+url.search,{method:request.method,headers,...(!['GET','HEAD'].includes(request.method)?{body:await request.arrayBuffer()}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});}catch{return Response.json({error:'The existing account service could not be reached. Please retry.'},{status:502});}
  let data;try{data=await response.json();if(!data||typeof data!=='object')throw Error('Invalid response');}catch{if(url.pathname==='/api/dev/framex'&&response.status===401)return Response.json({error:'Developer access required. Sign in to your administrator account.'},{status:401});return Response.json({error:'The existing account service returned an unexpected response.'},{status:502});}
  const output=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});const secure=sessionName(request).startsWith('__Host-')?'; Secure':'';
  if(response.ok&&authPaths.has(url.pathname)&&tokenPattern.test(data.token||'')){
   const ttl=Math.max(0,Math.min(30*86400,Math.floor((Number(data.expiresAt)-Date.now())/1000)));if(!ttl)return Response.json({error:'The account service returned an expired session.'},{status:502});
   output.append('Set-Cookie',`${sessionName(request)}=${data.token}; Path=/; HttpOnly; SameSite=Lax${secure}${data.remember===true?'; Max-Age='+ttl:''}`);
  }
  if(response.ok&&(url.pathname==='/api/auth/logout'||data.signedOut))output.append('Set-Cookie',`${sessionName(request)}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`);
  if(response.ok&&url.pathname==='/api/dev/framex'){
   if(typeof data.devToken==='string'&&/^\d+\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(data.devToken))output.append('Set-Cookie',`px-framex-dev=${data.devToken}; Path=/arcade-api/dev; HttpOnly; SameSite=Strict${secure}; Max-Age=3600`);
   if(request.method==='DELETE')output.append('Set-Cookie',`px-framex-dev=; Path=/arcade-api/dev; HttpOnly; SameSite=Strict${secure}; Max-Age=0`);
  }
  // Browser JavaScript never receives a reusable account or developer token.
  if(data&&typeof data==='object'){delete data.token;delete data.devToken;}
  return new Response(JSON.stringify(data),{status:response.status,headers:output});
 };
}
