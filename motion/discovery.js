import {score,choose,mergeHistory,elapsed} from './discovery-core.js?v=1';
const $=s=>document.querySelector(s);
const bridge=window.pixelDiscoveryBridge;
const player=$('#player');
const home=$('#home-page');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const key='px-discovery-history-v1';
let memory=[],active=null;
function read(){
  try{const data=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(data))memory=data.filter(r=>r&&typeof r.id==='string'&&Number.isFinite(r.lastPlayed)&&(r.duration===null||Number.isFinite(r.duration)));}catch{}
  return memory;
}
function write(entry){
  memory=mergeHistory(read(),entry);
  try{localStorage.setItem(key,JSON.stringify(memory));}catch{}
}
function sample(){
  if(!active)return;
  const now=performance.now();
  active.duration+=elapsed(active.last,now,active.visible);
  active.last=now;active.visible=!document.hidden;
  write({id:active.id,lastPlayed:active.started,duration:Math.floor(active.duration/1000)});
}
function finish(){sample();active=null;renderResume();}
function begin(g,external){
  if(!g||g.kind==='media')return;
  finish();
  const started=Date.now();
  if(external){write({id:g.id,lastPlayed:started,duration:null});renderResume();return;}
  active={id:g.id,started,duration:0,last:performance.now(),visible:!document.hidden};
  sample();renderResume();
}
function element(tag,cls,label){
  const node=document.createElement(tag);if(cls)node.className=cls;if(label!==undefined)node.textContent=label;return node;
}
function button(label,run,cls='pxd-button'){
  const b=element('button',cls,label);b.type='button';b.addEventListener('click',run);return b;
}
function games(){return bridge?.games()||[];}
function recent(){
  const map=new Map(games().map(g=>[g.id,g]));
  return read().filter(r=>map.has(r.id)).map(r=>({...r,game:map.get(r.id)}));
}
function duration(s){return s===null?'External launch · time unavailable':s<60?s+'s session':Math.floor(s/60)+'m '+s%60+'s session';}
function art(g){
  const wrap=element('span','pxd-art',g.glyph||'✦');
  if(g.cover){
    try{const url=new URL(g.cover,document.baseURI);if(['http:','https:'].includes(url.protocol)){const img=element('img');img.alt='';img.decoding='async';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>img.remove());img.src=url.href;wrap.append(img);}}catch{}
  }
  if(/^#[0-9a-f]{3,8}$/i.test(g.color||''))wrap.style.setProperty('--pxd-art-color',g.color);
  return wrap;
}
let resumeList;
function renderResume(){
  if(!resumeList)return;
  resumeList.replaceChildren();
  const rows=recent().slice(0,6);
  if(!rows.length){resumeList.append(element('p','pxd-muted','Your recently launched games will appear here.'));return;}
  for(const r of rows){
    const b=button('',()=>bridge.launch(r.game),'pxd-recent-card');
    const copy=element('span','pxd-recent-copy');
    const when=element('time','pxd-muted',new Date(r.lastPlayed).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}));when.dateTime=new Date(r.lastPlayed).toISOString();
    copy.append(element('strong','',r.game.name),when,element('small','pxd-muted',duration(r.duration)));
    b.append(art(r.game),copy,element('span','pxd-arrow','▶'));resumeList.append(b);
  }
}
if(bridge&&player){
  document.addEventListener('pixel-discovery-launch',e=>begin(e.detail.game,e.detail.external));
  player.addEventListener('close',finish);
  document.addEventListener('visibilitychange',sample);
  window.addEventListener('pagehide',finish);
  window.addEventListener('storage',e=>{if(e.key===key)renderResume();});
  setInterval(()=>{if(active)sample();},10000);
  const initial=bridge.active();if(initial)begin(initial,false);
}
function init(){
  if(!bridge||!home||!player||new URLSearchParams(location.search).get('gameview')==='1')return;
  function dialog(id,title){
    const d=element('dialog','pxd-dialog');d.id=id;d.setAttribute('aria-labelledby',id+'-title');
    const h=element('div','pxd-head');const copy=element('div');copy.append(element('small','pxd-kicker','PIXEL ARCADE / DISCOVER'),element('h2','',title));copy.lastChild.id=id+'-title';
    const close=button('×',()=>d.close(),'pxd-close');close.setAttribute('aria-label','Close '+title);h.append(copy,close);d.append(h);document.body.append(d);return d;
  }
  const palette=dialog('pxd-palette','Command centre');
  const input=element('input','pxd-search');input.type='search';input.placeholder='Search games, actions, themes…';input.setAttribute('aria-label','Search games and commands');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','true');input.setAttribute('aria-controls','pxd-results');
  const results=element('div','pxd-results');results.id='pxd-results';results.setAttribute('role','listbox');results.setAttribute('aria-label','Commands and games');
  const footer=element('div','pxd-footer','↑ ↓ Navigate   ·   Enter Select   ·   Esc Close');
  palette.append(input,results,footer);
  let selected=0,items=[];
  const actions=[
    ['Home','Navigation',()=>bridge.navigate('home')],['Game library','Navigation',()=>bridge.navigate('all')],
    ['Mini games','Navigation',()=>bridge.navigate('mini')],['Big games','Navigation',()=>bridge.navigate('big')],
    ['Custom games','Navigation',()=>bridge.navigate('custom')],
    ['Favourites','Navigation',()=>{bridge.navigate('all');const b=$('#favview');if(b&&!b.textContent.includes('Showing favourites'))b.click();}],
    ['Game roulette','Discovery',()=>openRoulette()],
    ['Settings','Settings',()=>$('#settingsview')?.click()],['My stats','Account',()=>$('#statsview')?.click()],
    ['Account','Account',()=>$('#accountview')?.click()],
    ['Colour themes','Appearance',()=>window.pixelThemes?.open()],
    ...['light','dark','system'].map(mode=>[mode[0].toUpperCase()+mode.slice(1)+' theme','Appearance',()=>window.pixelAppearance?.setMode(mode)])
  ].map(([name,group,run])=>({name,group,run}));
  function gameItem(g,group){return {name:g.name,group,game:g,run:()=>bridge.launch(g)};}
  function list(){
    const all=games(),byId=new Map(all.map(g=>[g.id,g])),q=input.value.trim(),seen=new Set();
    const pinned=[...recent().slice(0,5).map(r=>gameItem(r.game,'Recently played')),...bridge.favourites().map(id=>byId.get(id)).filter(Boolean).slice(0,5).map(g=>gameItem(g,'Favourites'))].filter(x=>!seen.has(x.game.id)&&seen.add(x.game.id));
    items=q?[...actions,...all.map(g=>gameItem(g,'Games'))].map(x=>({x,rank:Math.max(score(q,x.name),score(q,x.group)-15,score(q,x.game?.cat||'')-20)})).filter(x=>x.rank>=0).sort((a,b)=>b.rank-a.rank).slice(0,30).map(x=>x.x):[...pinned,...actions,...all.filter(g=>!seen.has(g.id)).slice(0,8).map(g=>gameItem(g,'Games'))];
    results.replaceChildren();selected=0;
    items.forEach((x,i)=>{
      const row=element('div','pxd-option');row.id='pxd-option-'+i;row.setAttribute('role','option');row.setAttribute('aria-selected','false');
      row.append(x.game?art(x.game):element('span','pxd-command-icon','↗'));
      const copy=element('span','pxd-option-copy');copy.append(element('strong','',x.name),element('small','pxd-muted',x.group+(x.game?' · '+x.game.cat:'')));row.append(copy);
      row.addEventListener('pointerdown',e=>e.preventDefault());row.addEventListener('click',()=>run(i));results.append(row);
    });
    if(!items.length)results.append(element('p','pxd-muted','No matching games or commands.'));
    mark(false);results.scrollTop=0;
  }
  function mark(scroll){
    for(let i=0;i<items.length;i++)results.children[i].setAttribute('aria-selected',String(i===selected));
    if(items.length){const row=results.children[selected];input.setAttribute('aria-activedescendant',row.id);if(scroll)row.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');
  }
  function run(i){const item=items[i];if(!item)return;palette.close();item.run();}
  input.addEventListener('input',list);
  input.addEventListener('keydown',e=>{
    if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(items.length){selected=(selected+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;mark(true);}}
    else if(e.key==='Enter'){e.preventDefault();run(selected);}
  });
  function allowed(){return !player.open&&!window.pixelTermsPending&&!document.querySelector('dialog[open]');}
  function openPalette(){if(!allowed())return;input.value='';list();palette.showModal();input.focus();}
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='k'){
      if(palette.open){e.preventDefault();palette.close();}
      else if(allowed()){e.preventDefault();openPalette();}
    }
  });
  const roulette=dialog('pxd-roulette','Game roulette');
  const controls=element('div','pxd-roulette-controls');
  const category=element('select','pxd-category');category.setAttribute('aria-label','Game category');
  let audioEnabled=false,ctx=null,animation=null,winning=null,generation=0;
  const sound=button('Sound off',()=>{audioEnabled=!audioEnabled;sound.textContent=audioEnabled?'Sound on':'Sound off';sound.setAttribute('aria-pressed',String(audioEnabled));if(audioEnabled)try{ctx??=new (window.AudioContext||window.webkitAudioContext)();ctx.resume().catch(()=>{});}catch{}});
  sound.setAttribute('aria-pressed','false');controls.append(category,sound);
  const viewport=element('div','pxd-roulette-window');const rail=element('div','pxd-rail');const marker=element('span','pxd-marker');marker.setAttribute('aria-hidden','true');viewport.append(rail,marker);rail.setAttribute('aria-hidden','true');
  const result=element('p','pxd-winner','Choose a category and spin.');result.setAttribute('role','status');result.setAttribute('aria-live','polite');
  const buttons=element('div','pxd-roulette-controls');
  const spinButton=button('Spin',spin,'pxd-button pxd-primary');const playButton=button('Play now',()=>{if(winning){const g=winning;roulette.close();bridge.launch(g);}});playButton.disabled=true;
  buttons.append(spinButton,playButton);roulette.append(controls,viewport,result,buttons);
  function categories(){
    const previous=category.value;category.replaceChildren();
    for(const name of ['All games',...new Set(games().map(g=>g.cat).filter(Boolean))]){const opt=element('option','',name);opt.value=name;category.append(opt);}
    if([...category.options].some(o=>o.value===previous))category.value=previous;
  }
  function card(g){
    const item=element('div','pxd-spin-card');item.append(art(g),element('strong','',g.name));return item;
  }
  function preview(){
    winning=null;playButton.disabled=true;spinButton.textContent='Spin';result.textContent='Choose a category and spin.';rail.replaceChildren();rail.style.transform='none';
    for(const g of games().filter(g=>category.value==='All games'||g.cat===category.value).slice(0,8))rail.append(card(g));
  }
  function openRoulette(){if(!allowed())return;categories();preview();roulette.showModal();spinButton.focus();}
  category.addEventListener('change',preview);
  function chime(){
    if(!audioEnabled||!ctx||ctx.state!=='running')return;
    for(const [i,hz] of [440,554,659].entries()){
      const osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime+i*.075;osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.055,t+.018);gain.gain.exponentialRampToValueAtTime(.0001,t+.19);osc.connect(gain).connect(ctx.destination);osc.start(t);osc.stop(t+.2);
    }
  }
  async function spin(){
    const all=games(),pool=all.filter(g=>category.value==='All games'||g.cat===category.value);
    const target=choose(all,category.value);if(!target){result.textContent='No games in this category.';return;}
    const token=++generation;winning=null;playButton.disabled=true;spinButton.disabled=true;category.disabled=true;result.textContent='Finding your next game…';rail.replaceChildren();rail.style.transform='none';viewport.classList.remove('pxd-selected');
    const targetIndex=24;
    for(let i=0;i<targetIndex+4;i++)rail.append(card(i===targetIndex?target:pool[Math.floor(Math.random()*pool.length)]));
    const node=rail.children[targetIndex],distance=node.offsetLeft+node.offsetWidth/2-viewport.clientWidth/2;
    if(!reduced.matches&&rail.animate){
      animation=rail.animate([{transform:'translateX(0)'},{transform:'translateX('+(-distance)+'px)'}],{duration:4200,easing:'cubic-bezier(.12,.76,.13,1)',fill:'forwards'});
      try{await animation.finished;}catch{return;}
    }
    if(token!==generation||!roulette.open)return;
    rail.style.transform='translateX('+(-distance)+'px)';animation?.cancel();animation=null;
    winning=target;node.classList.add('pxd-picked');viewport.classList.add('pxd-selected');result.textContent='Your next game: '+target.name;playButton.disabled=false;spinButton.disabled=false;category.disabled=false;spinButton.textContent='Spin again';chime();
  }
  roulette.addEventListener('close',()=>{generation++;animation?.cancel();animation=null;spinButton.disabled=false;category.disabled=false;viewport.classList.remove('pxd-selected');rail.replaceChildren();winning=null;});
  reduced.addEventListener('change',()=>{if(reduced.matches&&animation)animation.finish();});
  const entry=button('⌕  Commands  ·  Ctrl K',openPalette,'pxd-button pxd-entry');entry.title='Open command palette (Ctrl or Command + K)';
  const rouletteEntry=button('✦  Game roulette',openRoulette,'pxd-button pxd-entry');
  const section=element('section','pxd-resume');section.setAttribute('aria-labelledby','pxd-resume-title');
  const heading=element('div','pxd-resume-heading'),copy=element('div');copy.append(element('small','pxd-kicker','YOUR ARCADE / RECENT'),element('h2','','Continue playing'));copy.lastChild.id='pxd-resume-title';
  const launchers=element('div','pxd-launchers');launchers.append(entry,rouletteEntry);heading.append(copy,launchers);
  resumeList=element('div','pxd-recent-list');section.append(heading,resumeList,element('p','pxd-muted pxd-note','History is saved in this browser. Session time measures the visible embedded player, including menus and loading. Reopens the game; progress depends on the game.'));
  const search=$('#home-search-form');if(search?.parentElement===home)search.after(section);else home.append(section);
  for(const id of ['home-random','random']){const b=document.getElementById(id);if(b){b.onclick=openRoulette;}}
  const header=document.querySelector('header .header-actions');if(header){const shortcut=button('⌕',openPalette,'pxd-button pxd-shortcut');shortcut.setAttribute('aria-label','Open command palette');shortcut.title='Commands (Ctrl / Cmd + K)';header.append(shortcut);}
  renderResume();
}
if(document.body.classList.contains('arcade-booting'))document.addEventListener('pixel-interface-ready',init,{once:true});else init();
