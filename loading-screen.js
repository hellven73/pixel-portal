(()=>{'use strict';
 const key='pixel-loader-session-v1';
 const node=document.getElementById('pixel-launch-loader');
 if(!node||!document.documentElement.classList.contains('pixel-loading-enabled'))return;
 const skip=node.querySelector('#pixel-launch-skip');
 const status=node.querySelector('#pixel-launch-status');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const start=Date.now();
 let closed=false,ready=false,leaveTimer;
 const clear=()=>{
  if(closed)return;
  closed=true;
  window.clearTimeout(timeout);
  window.clearTimeout(leaveTimer);
  try{sessionStorage.setItem(key,'1')}catch{}
  document.documentElement.classList.remove('pixel-loading-enabled');
  node.remove();
 };
 const finish=()=>{
  if(closed)return;
  ready=true;
  node.classList.add('pixel-launch-dom-ready','pixel-launch-done');
  status.textContent='READY TO PLAY';
  node.querySelector('.pixel-launch-tag').lastChild.textContent=' READY';
  leaveTimer=window.setTimeout(()=>{
   if(closed)return;
   if(reduced){clear();return}
   node.classList.add('pixel-launch-leaving');
   window.setTimeout(clear,320);
  },reduced?0:440);
 };
 const onReady=()=>{if(ready||closed)return;const remaining=Math.max(0,(reduced?0:1150)-(Date.now()-start));window.setTimeout(finish,remaining)};
 const timeout=window.setTimeout(finish,6500);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',onReady,{once:true});else onReady();
 skip?.addEventListener('click',clear);
 window.addEventListener('pageshow',e=>{if(e.persisted)clear()},{once:true});
})();