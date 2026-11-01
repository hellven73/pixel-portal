// Integrates the existing Webported Games collection into the actual Pixel Arcade homepage.
// Uses the same in-page game player and never handles account data.
(()=>{
'use strict';
const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el};
const sidebar=document.querySelector('#side-nav'),main=document.querySelector('main');
if(!sidebar||!main||typeof showSection!=='function')return;
let ports=[],query='',featuredOnly=false,loaded=false;
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
introduction.append(make('div','eyebrow','PLAY THE IMPOSSIBLE'),make('h1','','Webported Games'),make('p','','Browser ports of games you know. Launch inside Pixel Arcade or open directly if embedding is blocked.'));
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
 info.textContent=matches.length+' of '+ports.length+' webports available · Hosted by independent creators';
 grid.replaceChildren();
 for(const port of matches){
  const card=make('article','px-webports-card');
  const art=make('div','px-webports-art');
  art.append(make('span','','🎮'),make('small','','WEB PORT'));
  const body=make('div','px-webports-details');
  body.append(make('h3','',port.name),make('p','',port.host));
  if(port.requirements)body.append(make('small','px-webports-requirements',port.requirements));
  const actions=make('div','px-webports-actions');
  const play=make('button','px-webports-play','▶ Play');play.type='button';
  play.onclick=()=>openGame({id:port.id,name:port.name,cat:'Webported Games',size:'big',embed:port.url,external:true,help:port.requirements||'Web port hosted externally. Click inside the game for controls.'},true);
  const external=make('a','px-webports-external','↗ Open directly');
  external.href=port.url;external.target='_blank';external.rel='noopener noreferrer';
  actions.append(play,external);
  if(port.sourceUrl){const source=make('a','px-webports-source','Source');source.href=port.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';actions.append(source)}
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
  if(Array.isArray(window.gameCatalog)){
   for(const port of ports){
    if(window.gameCatalog.some(g=>g.id===port.id))continue;
    window.gameCatalog.push({id:port.id,name:port.name,cat:'Simulation',size:'big',url:port.url,external:true,help:port.requirements||'Third-party browser port',color:'#638dd2'});
   }
   if(typeof render==='function'){} // Card renderer below owns this dedicated section.
  }
  render();
 }catch(error){
  loaded=false;info.textContent='Could not load webports: '+error.message;
  grid.replaceChildren();
  const reload=make('button','px-webports-play','Retry loading');reload.onclick=()=>void load();grid.append(reload);
 }
}
search.addEventListener('input',()=>{query=search.value.trim().toLowerCase();render()});
filter.onclick=()=>{featuredOnly=!featuredOnly;filter.setAttribute('aria-pressed',String(featuredOnly));filter.classList.toggle('selected',featuredOnly);render()};
if(window.pixelRequestedSection==='webports'||location.hash==='#webports')showSection('webports');
})();
