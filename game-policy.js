// Shared by both launchers: archived favourites must respect current catalogue removals.
(function(root){
 const removed=new Set(['falling-blocks','dots-boxes','reactor-memory','reversi','gta-v']);
 function allowed(g){
  if(!g||removed.has(g.id)||g.providerLaunch||g.isolatedLaunch)return false;
  if(g.kind==='media')return true;
  let u;try{u=new URL(g.embed||g.url||'', 'https://pixelarcade.com.au/arcade/')}catch{return false}
  if(!['https:','http:','blob:'].includes(u.protocol))return false;
  if(u.hostname==='katsugachi.github.io'||u.hostname.endsWith('.uwgraduation.org'))return false;
  if(/\/(?:native-games|table-games)\.html$/.test(u.pathname))return false;
  if(u.hostname==='eiym.org'&&/^\/(?:gn-math|seraph|truffled)\//.test(u.pathname))return false;
  if(u.hostname.endsWith('.itch.io'))return false;
  return true;
 }
 root.pixelGameAllowed=allowed;
})(globalThis);
