// GitHub Pages interface; passwords are never stored in browser storage.
(()=>{const base='https://pixelarcade.com.au/github-api',key='px-mirror-api-session';let token='',expiresAt=0,persistent=false,devToken='';
const valid=s=>s&&s.expiresAt>Date.now()&&/^[a-f0-9]{64}$/.test(s.token||'');
function saved(storage){try{const s=JSON.parse(storage.getItem(key)||'null');if(valid(s))return s;storage.removeItem(key)}catch{}return null}
function adopt(s,remember){token=s?.token||'';expiresAt=s?.expiresAt||0;persistent=!!s&&remember}
let initial=null;try{initial=saved(sessionStorage)}catch{}if(!initial)try{initial=saved(localStorage)}catch{}if(initial)adopt(initial,initial.remember===true);try{devToken=sessionStorage.getItem('px-mirror-dev-session')||''}catch{}
function clear(announce=false){const had=!!token;adopt(null,false);for(const name of ['sessionStorage','localStorage'])try{window[name].removeItem(key)}catch{}if(announce&&had)document.dispatchEvent(new CustomEvent('pixel-session-changed'))}
window.addEventListener('storage',e=>{if(e.key!==key&&e.key!==null)return;let s=null;try{s=saved(localStorage)}catch{}if(s||persistent){try{sessionStorage.removeItem(key)}catch{}adopt(s,true);document.dispatchEvent(new CustomEvent('pixel-session-changed'))}});
async function request(path,options={}){if(!path.startsWith('/api/'))throw Error('Invalid service path.');if(expiresAt&&expiresAt<=Date.now())clear(true);const sentToken=token,headers=new Headers(options.headers||{});headers.set('X-Pixel-Client','github-pages');if(token)headers.set('Authorization','Bearer '+token);if(path.startsWith('/api/dev/framex')&&devToken)headers.set('X-Pixel-Dev-Token',devToken);
let response;try{response=await fetch(base+path.slice(4),{...options,headers,credentials:'omit'})}catch{throw Error('Could not reach the Pixel account service. Your network may block it; ask your network administrator if access is permitted, or try again on an allowed connection.')}
const data=await response.json().catch(()=>({error:'Pixel services returned an unexpected response.'}));
if(!response.ok){if(response.status===401&&sentToken===token&&!path.startsWith('/api/auth/'))clear(true);throw Object.assign(new Error(data.error||'Could not complete that request.'),{status:response.status})}
if(/^\/api\/auth\/(login|register)$/.test(path)&&valid(data)){clear();adopt(data,data.remember===true);const value=JSON.stringify({token,expiresAt,remember:persistent});try{(persistent?localStorage:sessionStorage).setItem(key,value)}catch{data.sessionNotice='This browser could not save your session. You may need to sign in again after closing this page.';try{sessionStorage.setItem(key,value)}catch{}}}
if(path==='/api/auth/logout'||(path==='/api/auth/recovery'&&data.signedOut))clear(true);
if(path.startsWith('/api/dev/framex')){if(data.devToken){devToken=data.devToken;try{sessionStorage.setItem('px-mirror-dev-session',devToken)}catch{}}if(options.method==='DELETE'){devToken='';try{sessionStorage.removeItem('px-mirror-dev-session')}catch{}}}
return data;
}window.pixelApi={request};})();
