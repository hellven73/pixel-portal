// Integrates the existing Webported Games collection into the actual Pixel Arcade homepage.
// Uses the same in-page game player and never handles account data.
(()=>{
'use strict';
const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
const sidebar=document.querySelector('#side-nav'),main=document.querySelector('main');
if(!sidebar||!main||typeof showSection!=='function')return;
let ports=[],query='',featuredOnly=false,loaded=false,activePort=null;
const button=make('button','side-link','');
button.dataset.section='webports';
const icon=make('span','','🚀'),label=document.createTextNode('Webported Games '),count=make('small','','…');
button.append(icon,label,count);
const after=sidebar.querySelector('[data-section="big"]');
if(after)after.after(button);else sidebar.append(button);
const page=make('section','px-webports-page');
page.id='px-webports-page';page.hidden=true;
const heading=make('div','px-webports-heading');
const introduction=make('div');
introduction.append(make('div','eyebrow','PLAY THE IMPOSSIBLE'),make('h1','','Webported Games'),make('p','','Browser ports of games you know. Launch them inside Pixel Arcade without leaving the site.'));
heading.append(introduction);
const tools=make('div','px-webports-toolbar');
const search=make('input','px-webports-search');search.type='search';search.placeholder='Search 18 webports…';search.setAttribute('aria-label','Search webported games');
const filter=make('button','px-webports-filter','★ Featured only');filter.type='button';filter.setAttribute('aria-pressed','false');
tools.append(search,filter);
const info=make('p','px-webports-status','Loading webported games…');
const grid=make('div','px-webports-grid');
page.append(heading,tools,info,grid);
const footer=main.querySelector('footer');if(footer)footer.before(page);else main.append(page);
const previous=showSection;
showSection=function(next){
 if(next==='webports'){
  previous('home');
  const home=document.querySelector('#home-page');if(home)home.hidden=true;
  page.hidden=false;
  section='webports';
  document.body.dataset.section='webports';
  document.querySelectorAll('#side-nav .side-link').forEach(b=>b.classList.toggle('active',b===button));
  history.replaceState(null,'','#webports');
  window.scrollTo({top:0,behavior:'instant'});
  if(!loaded)void load();
 }else{page.hidden=true;previous(next);}
};
button.onclick=()=>showSection('webports');
function render(){
 const matches=ports.filter(p=>p.name.toLowerCase().includes(query)&&(!featuredOnly||p.featured));
 info.textContent=matches.length+' of '+ports.length+' webported games';
 grid.replaceChildren();
 for(const port of matches){
  const card=make('article','px-webports-card');
  const art=make('div','px-webports-art');
  art.append(make('span','','🎮'),make('small','','WEB PORT'));
  const body=make('div','px-webports-details');
  body.append(make('h3','',port.name));
  if(port.requirements)body.append(make('small','px-webports-requirements',port.requirements));
  const actions=make('div','px-webports-actions');
  const play=make('button','px-webports-play','▶ Play');play.type='button';
  play.onclick=()=>{
   activePort=port.id;
   openGame({id:port.id,name:port.name,cat:'Webported Games',size:'big',embed:port.url,external:true,help:port.requirements||'Click inside the game for controls.'},true);
  };
  actions.append(play);
  body.append(actions);card.append(art,body);grid.append(card);
 }
 if(!matches.length)grid.append(make('p','px-webports-empty','No matching webports. Try a different search.'));
}
async function load(){
 loaded=true;
 try{
  const response=await fetch('/webports.json?v=7',{cache:'no-store'});
  if(!response.ok)throw Error('Webports catalogue returned '+response.status);
  const data=await response.json();
  if(!Array.isArray(data.games))throw Error('Invalid catalogue');
  ports=data.games.filter(p=>p&&typeof p.name==='string'&&typeof p.url==='string'&&/^https:\/\//.test(p.url));
  count.textContent=String(ports.length);
  render();
 }catch(error){
  loaded=false;info.textContent='Could not load webports: '+error.message;
  grid.replaceChildren();
  const reload=make('button','px-webports-play','Retry loading');reload.onclick=()=>void load();grid.append(reload);
 }
}

const gameDialog=document.querySelector('#player'),fullButton=document.querySelector('#fullscreen');
function closeTheater(){
 if(!gameDialog)return;
 gameDialog.classList.remove('px-webport-theater');
 if(fullButton){fullButton.textContent='⛶ Fullscreen';fullButton.title='Expand game';}
}
if(gameDialog&&fullButton){
 // Capture before the original game's onclick, so it doesn't invoke requestFullscreen.
 fullButton.addEventListener('click',event=>{
  if(!activePort)return;
  event.preventDefault();event.stopImmediatePropagation();
  const theater=gameDialog.classList.toggle('px-webport-theater');
  fullButton.textContent=theater?'⤢ Restore':'⛶ Fullscreen';
  fullButton.title=theater?'Restore normal size':'Expand game within Pixel Arcade';
 },true);
 gameDialog.addEventListener('cancel',event=>{
  if(!gameDialog.classList.contains('px-webport-theater'))return;
  event.preventDefault();closeTheater();
 });
 gameDialog.addEventListener('close',()=>{closeTheater();activePort=null});
}
const resumeGame=window.pixelResumePendingGame;
if(typeof resumeGame==='function'){
 window.pixelResumePendingGame=function(){
  const pending=window.pixelPendingGameId;
  const port=ports.find(p=>p.id===pending);
  if(!port)return resumeGame();
  window.pixelPendingGameId='';
  activePort=pending;
  openGame({id:port.id,name:port.name,cat:'Webported Games',size:'big',embed:port.url,external:true,help:port.requirements||'Click inside the game for controls.'},true);
  return true;
 };
}
search.addEventListener('input',()=>{query=search.value.trim().toLowerCase();render()});
filter.onclick=()=>{featuredOnly=!featuredOnly;filter.setAttribute('aria-pressed',String(featuredOnly));filter.classList.toggle('selected',featuredOnly);render()};
if(window.pixelRequestedSection==='webports'||location.hash==='#webports')showSection('webports');
})();
