// Shared by both launchers: archived favourites must respect current catalogue removals.
(function(root){
 const removed=new Set(['minecraft262','bitlife','gta-san-andreas','falling-blocks','dots-boxes','reactor-memory','reversi','gta-v','snake','breakout','pong','flap','dodge','runner','invaders','2048','memory','mines','ttt','connect','reaction','aim','lights','slide','simon','typing']);
 const removedNames=new Set(["minecraft262", "bitlife", "gtasanandreasfreeroam", "2048", "aimtrainer", "asteroids", "brickbreaker", "connectfour", "dinorunner", "flappybird", "lightsout", "memorymatch", "minesweeper", "pong", "reactiontest", "simonsays", "slidingpuzzle", "snake", "spaceshooter", "tictactoe", "typingtest"]);
 function allowed(g){
  if(!g||removedNames.has(String(g.name||'').toLowerCase().replace(/[^a-z0-9]/g,''))||removed.has(g.id)||g.providerLaunch||g.isolatedLaunch)return false;
  if(g.kind==='media')return true;
  if(/minecraft|bitlife|san[\s:_-]*andreas/i.test(String(g.name||'')+' '+String(g.embed||g.url||'')))return false;
  let u;try{u=new URL(g.embed||g.url||'', 'https://pixelarcade.com.au/arcade/')}catch{return false}
  if(!['https:','http:','blob:'].includes(u.protocol))return false;
  if(u.hostname==='katsugachi.github.io'||u.hostname.endsWith('.uwgraduation.org'))return false;
  if(/\/(?:native-games|table-games|2048)\.html$/.test(u.pathname))return false;
  if(u.hostname==='eiym.org'&&/^\/(?:gn-math|seraph|truffled)\//.test(u.pathname))return false;
  if(u.hostname.endsWith('.itch.io'))return false;
  return true;
 }
 root.pixelGameAllowed=allowed;
})(globalThis);
