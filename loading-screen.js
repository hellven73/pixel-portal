// Always display this intro during a real page navigation; no private browsing required.
(()=>{'use strict';
 const node=document.getElementById('pixel-launch-loader');
 if(!node||!document.documentElement.classList.contains('pixel-loading-enabled'))return;
 const skip=node.querySelector('#pixel-launch-skip');
 const status=node.querySelector('#pixel-launch-status');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const started=Date.now(),minimum=reduced?80:1400;
 let closed=false,ready=false,finishTimer=0,exitTimer=0;
 const clear=()=>{
  if(closed)return;
  closed=true;
  window.clearTimeout(safetyTimer);
  window.clearTimeout(finishTimer);
  window.clearTimeout(exitTimer);
  document.documentElement.classList.remove('pixel-loading-enabled');
  node.remove();
 };
 const finish=()=>{
  if(closed||ready)return;
  ready=true;
  finishTimer=window.setTimeout(()=>{
   if(closed)return;
   node.classList.add('pixel-launch-dom-ready','pixel-launch-done');
   status.textContent='READY TO PLAY';
   const tag=node.querySelector('.pixel-launch-tag');
   if(tag)tag.lastChild.textContent=' READY';
   exitTimer=window.setTimeout(()=>{
    if(closed)return;
    if(reduced)return clear();
    node.classList.add('pixel-launch-leaving');
    exitTimer=window.setTimeout(clear,320);
   },reduced?0:380);
  },Math.max(0,minimum-(Date.now()-started)));
 };
 // The loading animation is cosmetic: it must never trap visitors when resources fail.
 const safetyTimer=window.setTimeout(finish,6500);
 if(document.readyState==='complete')finish();
 else window.addEventListener('load',finish,{once:true});
 skip?.addEventListener('click',clear);
 window.addEventListener('pageshow',event=>{if(event.persisted)clear()});
})();