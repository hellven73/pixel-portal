'use strict';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const svg = id => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
const storage = {
 get(key, fallback) { try { const raw=localStorage.getItem(`pixel:${key}`); return raw===null?fallback:JSON.parse(raw); } catch {return fallback;} },
 set(key,value) { try {localStorage.setItem(`pixel:${key}`,JSON.stringify(value));return true;} catch {return false;} }
};
const themes=[
 {id:'violet',name:'Violet hour',color:'#b7a1ff',bg:'#171125',desc:'A little after midnight.'},
 {id:'mint',name:'Afterglow',color:'#a7edc6',bg:'#0f2219',desc:'A breath of fresh air.'},
 {id:'blue',name:'Blue hour',color:'#9ecbff',bg:'#112238',desc:'Somewhere past the horizon.'},
 {id:'rose',name:'Rose quartz',color:'#ffb2c9',bg:'#321523',desc:'Life through a softer lens.'},
 {id:'amber',name:'Golden state',color:'#f0c687',bg:'#2b2010',desc:'Stay for the sunset.'},
 {id:'mono',name:'Monochrome',color:'#e6e6e7',bg:'#202023',desc:'Less colour. Same character.'}
];
let theme = storage.get('theme','violet');
if(!themes.some(t=>t.id===theme)) theme='violet';
const reducedMedia=matchMedia('(prefers-reduced-motion: reduce)');
let reduced=storage.get('reduced',reducedMedia.matches);
document.documentElement.classList.toggle('reduce-motion',reduced);
$('#reduce-motion').checked=reduced;
const prefersMotion=()=>!reduced&&!reducedMedia.matches;
let toastTimeout;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('#toast').hidden=true,3500);}
function applyTheme(id,save=true){
 const t=themes.find(t=>t.id===id)||themes[0]; theme=t.id; document.documentElement.dataset.theme=theme;
 $('meta[name="theme-color"]').content=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
 $$('.swatch,.theme-card').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===theme)));
 $$('.theme-card-label span').forEach(s=>s.textContent=s.parentElement.parentElement.dataset.theme===theme?'Selected ✓':'Choose ↗');
 $('#footer-theme').textContent=t.name.toUpperCase();
 if(save)storage.set('theme',theme);
}
for(const t of themes){
 const button=document.createElement('button');button.className='swatch';button.dataset.theme=t.id;button.style.setProperty('--swatch',t.color);button.setAttribute('aria-label',t.name);button.title=t.name;button.onclick=()=>applyTheme(t.id);$('#intro-swatches').append(button);
 const card=document.createElement('button');card.className='theme-card';card.dataset.theme=t.id;card.setAttribute('aria-label',`Use ${t.name} theme`);card.innerHTML=`<div class="theme-preview" style="--previewbg:${t.bg};--previewfg:${t.color}"><span>Aa</span><div class="preview-line"></div></div><div class="theme-card-label">${t.name}<span>Choose ↗</span></div>`;card.onclick=()=>{applyTheme(t.id);toast(`${t.name}. Looks good on you.`);};$('#theme-grid').append(card);
}
applyTheme(theme,false);
// Animate a lightweight starfield only while the entrance is visible.
const stars=$('#stars'),starCtx=stars.getContext('2d');let starFrame=0,starTick=0;
function starfield(){
 cancelAnimationFrame(starFrame);
 const w=stars.clientWidth,h=stars.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
 stars.width=w*dpr;stars.height=h*dpr;starCtx.setTransform(dpr,0,0,dpr,0,0);
 const dots=Array.from({length:55},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.1+.3,v:Math.random()*.15+.05,a:Math.random()*.45+.12}));
 function draw(){
  if($('#entrance').hidden)return;
  starCtx.clearRect(0,0,w,h);starCtx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--accent');
  for(const s of dots){starCtx.globalAlpha=s.a*(.8+Math.sin(starTick*.01+s.x)*.2);starCtx.beginPath();starCtx.arc(s.x,s.y,s.r,0,Math.PI*2);starCtx.fill();if(prefersMotion()){s.y-=s.v;if(s.y<0)s.y=h;}}
  starCtx.globalAlpha=1;starTick++;if(prefersMotion())starFrame=requestAnimationFrame(draw);
 }draw();
}
let isEntering=false;
function enter(){
 if(isEntering||$('#entrance').hidden)return;isEntering=true;$('#entrance').classList.add('entering');
 setTimeout(()=>{$('#entrance').hidden=true;$('#entrance').classList.remove('entering');$('#app').hidden=false;$('#app').classList.add('app-appear');cancelAnimationFrame(starFrame);$('#main').focus({preventScroll:true});isEntering=false;},prefersMotion()?850:0);
}
function replay(){stopGame();$('#game-dialog').close();$('#app').hidden=true;$('#entrance').hidden=false;$('#entrance').classList.remove('entering');starfield();$('#enter').focus({preventScroll:true});window.scrollTo(0,0);}
$('#enter').onclick=enter;$('#skip-intro').onclick=enter;$('#replay').onclick=replay;$('#replay-home').onclick=replay;
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!$('#entrance').hidden&&!['BUTTON','A','INPUT'].includes(document.activeElement.tagName)){e.preventDefault();enter();}});
window.addEventListener('resize',()=>{if(!$('#entrance').hidden)starfield();});
$('#reduce-motion').onchange=e=>{reduced=e.target.checked;storage.set('reduced',reduced);document.documentElement.classList.toggle('reduce-motion',reduced);if(!$('#entrance').hidden)starfield();};
$('#show-entrance').checked=storage.get('showEntrance',true);$('#show-entrance').onchange=e=>storage.set('showEntrance',e.target.checked);
let view='home';const titles={home:'Home',games:'Arcade',browse:'Explore',music:'Music',notes:'Notebook',themes:'Appearance'};
function setView(next,updateHash=true){
 if(!Object.hasOwn(titles,next))next='home';view=next;
 $$('[data-page]').forEach(s=>s.hidden=s.dataset.page!==view);$$('nav [data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 $('#page-name').textContent=titles[view];document.title=`${titles[view]} — Pixel Portal`;
 if(updateHash)history.replaceState(null,'',`#${view}`);window.scrollTo(0,0);
}
document.addEventListener('click',e=>{const target=e.target.closest('[data-view]');if(target)setView(target.dataset.view);});
$('#theme-shortcut').onclick=()=>setView('themes');
window.addEventListener('hashchange',()=>setView(location.hash.slice(1),false));setView(location.hash.slice(1)||'home',false);
function clock(){const now=new Date();$('#clock').textContent=now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});$('#today').textContent=now.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'short'}).toUpperCase();const hour=now.getHours();$('#greeting').textContent=hour<12?'A fresh day. A whole internet of possibilities.':hour<18?'Your afternoon, with a little more possibility.':'A little escape for your evening.';}clock();setInterval(clock,30000);
// Game catalogue: all games are included locally.
const games=[
{id:'2048',name:'2048',category:'puzzle',label:'PUZZLE · MERGE & REPEAT',bg:'#2b253f',fg:'#c4b1ed',art:'<span class="art-num">2048</span>'},
{id:'snake',name:'Neon Snake',category:'quick',label:'CLASSIC · KEEP GROWING',bg:'#1d302a',fg:'#a2dcb6',art:'<span class="art-snake">'+ '<i></i>'.repeat(7)+'</span>'},
{id:'breakout',name:'Brick Breaker',category:'quick',label:'ARCADE · BREAK THE PATTERN',bg:'#332221',fg:'#dca58f',art:'<span class="art-break">'+'<i></i>'.repeat(15)+'</span>'},
{id:'memory',name:'Match Point',category:'puzzle',label:'MEMORY · FIND YOUR MATCH',bg:'#1c2d39',fg:'#9bbfd7',art:'<span class="art-memory"><i>✦</i><i>✦</i></span>'},
{id:'tic',name:'Noughts & Crosses',category:'puzzle',label:'TWO PLAYERS · YOUR MOVE',bg:'#302739',fg:'#d6b2dd',art:'<span class="art-tic">×○</span>'},
{id:'reaction',name:'Reflex',category:'quick',label:'QUICK PLAY · IN A HEARTBEAT',bg:'#34301b',fg:'#e0d28f',art:'<span class="art-reaction">ϟ</span>'},
{id:'mines',name:'Minefield',category:'puzzle',label:'PUZZLE · WATCH YOUR STEP',bg:'#202c34',fg:'#a5c0d1',art:'<span class="art-mines">✹</span>'},
{id:'pong',name:'Pocket Pong',category:'quick',label:'ARCADE · KEEP IT IN PLAY',bg:'#2b2b37',fg:'#bbb8e6',art:'<span class="art-pong">┃•┃</span>'}
];
let favorites=storage.get('favorites',[]);if(!Array.isArray(favorites))favorites=[];let filter='all';
function gameCard(game){
 const card=document.createElement('article');card.className='game-card';
 const open=document.createElement('button');open.className='game-open';open.setAttribute('aria-label',`Play ${game.name}`);open.innerHTML=`<div class="game-art" style="--gamebg:${game.bg};--gamefg:${game.fg}">${game.art}</div><div class="game-info"><h4>${game.name}</h4><p>${game.label}</p></div>`;open.onclick=()=>openGame(game);card.append(open);
 const fav=document.createElement('button');fav.className='game-fav';fav.innerHTML=svg('star');fav.setAttribute('aria-label',`Favourite ${game.name}`);fav.setAttribute('aria-pressed',String(favorites.includes(game.id)));fav.onclick=()=>{favorites=favorites.includes(game.id)?favorites.filter(x=>x!==game.id):[...favorites,game.id];storage.set('favorites',favorites);renderGames();};card.append(fav);return card;
}
function renderGames(){
 const query=$('#game-search').value.trim().toLowerCase();const selected=games.filter(g=>(filter==='all'||filter===g.category||(filter==='favorites'&&favorites.includes(g.id)))&&g.name.toLowerCase().includes(query));
 $('#game-grid').replaceChildren(...selected.map(gameCard));$('#games-empty').hidden=selected.length>0;$('#home-games').replaceChildren(...games.slice(0,4).map(gameCard));
}
$$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle('selected',x===b));renderGames();});$('#game-search').oninput=renderGames;renderGames();
let gameCleanup=()=>{},currentGame=null;
function stopGame(){gameCleanup();gameCleanup=()=>{};}
function openGame(game){stopGame();currentGame=game;$('#game-title').textContent=game.name;$('#game-mount').replaceChildren();$('#game-dialog').showModal();gameCleanup=PixelGames[game.id]($('#game-mount'),storage)||(()=>{});}
$('#restart-game').onclick=()=>{if(currentGame){stopGame();$('#game-mount').replaceChildren();gameCleanup=PixelGames[currentGame.id]($('#game-mount'),storage)||(()=>{});}};
$('#close-game').onclick=()=>$('#game-dialog').close();$('#game-dialog').addEventListener('close',stopGame);$('#game-dialog').addEventListener('click',e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close();}});
// Search and bookmarks. Protocols are deliberately limited to web addresses.
function webAddress(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function navigateSearch(value){const q=value.trim();if(!q)return;let address=webAddress(q);if(!address&&/^([a-z0-9-]+\.)+[a-z]{2,}(\/|$)/i.test(q))address=webAddress(`https://${q}`);if(!address){const engine=$('#search-engine').value;const base=engine==='google'?'https://www.google.com/search?q=':engine==='bing'?'https://www.bing.com/search?q=':'https://duckduckgo.com/?q=';address=base+encodeURIComponent(q);}window.open(address,'_blank','noopener,noreferrer');}
for(const form of $$('#home-search,#browse-search'))form.onsubmit=e=>{e.preventDefault();navigateSearch($('input',form).value);};
const defaultBookmarks=[{id:'pixel',name:'Pixel Arcade',url:'https://hellven73.github.io/pixel-arcade/'},{id:'youtube',name:'YouTube',url:'https://www.youtube.com/'},{id:'github',name:'GitHub',url:'https://github.com/'},{id:'wikipedia',name:'Wikipedia',url:'https://www.wikipedia.org/'},{id:'spotify',name:'Spotify',url:'https://open.spotify.com/'},{id:'scratch',name:'Scratch',url:'https://scratch.mit.edu/'}];
let bookmarks=storage.get('bookmarks',defaultBookmarks);if(!Array.isArray(bookmarks))bookmarks=defaultBookmarks;bookmarks=bookmarks.filter(b=>typeof b.name==='string'&&webAddress(b.url));
function renderBookmarks(){
 $('#bookmarks').replaceChildren(...bookmarks.map(b=>{const card=document.createElement('div');card.className='bookmark-card';const link=document.createElement('a');link.href=webAddress(b.url);link.target='_blank';link.rel='noopener noreferrer';link.style.display='contents';const initial=document.createElement('span');initial.className='bookmark-initial';initial.textContent=b.name[0]?.toUpperCase()||'↗';const text=document.createElement('div');text.className='bookmark-text';const h=document.createElement('h4');h.textContent=b.name;const p=document.createElement('p');p.textContent=new URL(b.url).hostname;text.append(h,p);link.append(initial,text);const remove=document.createElement('button');remove.className='bookmark-remove';remove.textContent='×';remove.setAttribute('aria-label',`Remove ${b.name} bookmark`);remove.onclick=()=>{bookmarks=bookmarks.filter(x=>x.id!==b.id);storage.set('bookmarks',bookmarks);renderBookmarks();toast('Bookmark removed.');};card.append(link,remove);return card;}));
}renderBookmarks();
$('#add-bookmark').onclick=()=>$('#bookmark-dialog').showModal();$('#close-bookmark').onclick=()=>$('#bookmark-dialog').close();$('#bookmark-form').onsubmit=e=>{e.preventDefault();const data=new FormData(e.target);const url=webAddress(data.get('url'));const name=data.get('name').trim();if(!url||!name){toast('Enter a name and an http:// or https:// website.');return;}bookmarks.push({id:(globalThis.crypto?.randomUUID?.()||`bookmark-${Date.now()}-${Math.random().toString(36).slice(2)}`),name,url});storage.set('bookmarks',bookmarks);renderBookmarks();$('#bookmark-dialog').close();e.target.reset();toast('A new place on your launchpad.');};
// Notebook: save while typing, without sending content to a server.
let note=storage.get('note','');$('#note').value=typeof note==='string'?note:'';
function noteCount(){const text=$('#note').value.trim();const n=text?text.split(/\s+/).length:0;$('#word-count').textContent=`${n} word${n===1?'':'s'}`;}noteCount();
$('#note').oninput=()=>{noteCount();$('#note-status').textContent=storage.set('note',$('#note').value)?'Saved on this device':'Storage is full. Export to keep your note.';};
$('#export-note').onclick=()=>{const url=URL.createObjectURL(new Blob([$('#note').value],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='pixel-notebook.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
// Original ambient audio generated with Web Audio. No remote audio assets.
const tracks=[{name:'Orbital drift',description:'A slow-moving constellation of soft tones.',detail:'SOFT SYNTH · FLOAT AWAY',frequencies:[130.81,196,261.63,329.63],shape:'sine',symbol:'✦'},{name:'Blue horizon',description:'Warm waves for a clearer head.',detail:'WARM PADS · FIND YOUR FOCUS',frequencies:[110,164.81,220,277.18],shape:'sine',symbol:'≈'},{name:'After hours',description:'A quiet hum from a city that never sleeps.',detail:'DEEP TONES · SLOW IT DOWN',frequencies:[98,146.83,196,246.94],shape:'triangle',symbol:'☾'}];
let trackIndex=0,audioCtx=null,master=null,nodes=[],playing=false,audioUrl=null,ambientVersion=0;
const localAudio=$('#local-audio');
function updateAudioUI(){document.body.classList.toggle('playing',playing);for(const b of $$('#home-play,#ambient-play')){b.innerHTML=playing?'Ⅱ':svg('play');b.setAttribute('aria-label',`${playing?'Pause':'Play'} ${tracks[trackIndex].name}`);}$('#sound-toggle').setAttribute('aria-label',playing?'Pause ambient sound':'Play ambient sound');$('#sound-toggle').style.color=playing?'var(--accent)':'';}
function stopAmbient(){ambientVersion++;for(const n of nodes){try{n.stop();}catch{}}nodes=[];playing=false;updateAudioUI();}
async function playAmbient(){
 if(playing){stopAmbient();return;}
 try{
 const version=++ambientVersion;
 if(!audioCtx){audioCtx=new(window.AudioContext||window.webkitAudioContext)();master=audioCtx.createGain();master.connect(audioCtx.destination);}
 await audioCtx.resume();if(version!==ambientVersion)return;
 localAudio.pause();master.gain.value=Number($('#volume').value)/100*.14;
 const track=tracks[trackIndex];
 track.frequencies.forEach((f,i)=>{const oscillator=audioCtx.createOscillator();oscillator.type=track.shape;oscillator.frequency.value=f;oscillator.detune.value=(i%2?1:-1)*3;const gain=audioCtx.createGain();gain.gain.value=.15;const lfo=audioCtx.createOscillator();lfo.frequency.value=.08+i*.025;const depth=audioCtx.createGain();depth.gain.value=.11;lfo.connect(depth);depth.connect(gain.gain);oscillator.connect(gain);gain.connect(master);oscillator.start();lfo.start();nodes.push(oscillator,lfo);});
 playing=true;updateAudioUI();
 }catch{toast('Audio could not start in this browser. Try a local audio file.');}
}
function chooseTrack(index){const wasPlaying=playing;stopAmbient();trackIndex=index;$('#track-title').textContent=tracks[index].name;$('#home-track').textContent=tracks[index].name;$('#track-detail').textContent=tracks[index].description;$$('.track-option').forEach((b,i)=>{b.classList.toggle('selected',i===index);b.setAttribute('aria-pressed',String(i===index));});updateAudioUI();if(wasPlaying)playAmbient();}
$('#ambient-list').replaceChildren(...tracks.map((t,i)=>{const b=document.createElement('button');b.className=`track-option${i===0?' selected':''}`;b.setAttribute('aria-pressed',String(i===0));b.innerHTML=`<span>${t.symbol}</span><div><strong>${t.name}</strong><small>${t.detail}</small></div><span>0${i+1}</span>`;b.onclick=()=>chooseTrack(i);return b;}));
for(const b of $$('#home-play,#ambient-play,#sound-toggle'))b.onclick=playAmbient;
$('#volume').oninput=()=>{const volume=Number($('#volume').value)/100;if(master)master.gain.value=volume*.14;localAudio.volume=volume;};
localAudio.volume=.35;localAudio.addEventListener('play',stopAmbient);
$('#audio-upload').onchange=e=>{const file=e.target.files[0];if(!file)return;if(file.type&&!file.type.startsWith('audio/')){toast('Please choose an audio file.');return;}stopAmbient();if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(file);localAudio.src=audioUrl;localAudio.hidden=false;toast(`Ready to play: ${file.name}`);};
localAudio.addEventListener('error',()=>toast('This audio format is not supported by your browser.'));
for(let i=0;i<40;i++){const bar=document.createElement('i');bar.style.height=`${4+Math.abs(Math.sin(i*.9)*Math.cos(i*.3))*20}px`;$('.equalizer').append(bar);}
updateAudioUI();
if(!$('#show-entrance').checked){$('#entrance').hidden=true;$('#app').hidden=false;}else starfield();
