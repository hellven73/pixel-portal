// The public Pages frontend uses account-scoped bearer sessions. The main site keeps HttpOnly cookies.
export const githubOrigin='https://hellven73.github.io';
export function githubHeaders(incoming,origin){
 const headers=new Headers();headers.set('Origin',origin);headers.set('X-Pixel-Client','pixel-arcade');
 if(incoming['content-type'])headers.set('Content-Type',incoming['content-type']);
 const token=/^Bearer ([a-f0-9]{64})$/.exec(incoming.authorization||'')?.[1];
 const preview=['terminal.local','localhost','127.0.0.1'].includes(new URL(origin).hostname);
 const parts=token?[`${preview?'px-preview-session':'__Host-px-session'}=${token}`]:[];
 const dev=incoming['x-pixel-dev-token'];if(dev&&/^\d+\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(dev))parts.push('px-framex-dev='+dev);
 if(parts.length)headers.set('Cookie',parts.join('; '));return headers;
}
export async function githubResponse(response,path,body){
 let data;try{data=await response.json();}catch{data={error:response.status===401?'Sign in to an authorized account.':'The service returned an unexpected response.'};}
 const cookies=response.headers.getSetCookie?.()||[response.headers.get('set-cookie')||''];
 if(response.ok&&['/arcade-api/auth/login','/arcade-api/auth/register'].includes(path)){
  const line=cookies.find(c=>/(?:__Host-px-session|px-preview-session)=/.test(c))||'';
  const token=/(?:__Host-px-session|px-preview-session)=([a-f0-9]{64})/.exec(line)?.[1];
  if(token){let remember=false;try{remember=JSON.parse(body.toString('utf8')).remember===true}catch{}const maxAge=Number(/Max-Age=(\d+)/i.exec(line)?.[1]||86400);data={...data,token,remember,expiresAt:Date.now()+Math.min(maxAge,30*86400)*1000};}
 }
 if(response.ok&&path==='/arcade-api/dev/framex'){const dev=/px-framex-dev=([^;]+)/.exec(cookies.join(';'))?.[1];if(dev)data={...data,devToken:dev};}
 return new Response(JSON.stringify(data),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
