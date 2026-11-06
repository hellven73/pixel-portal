'use strict';
(async()=>{
 const status=document.getElementById('status');
 const report=(type,message)=>{status.hidden=type==='ready';status.textContent=message;if(window.PORTAL_ORIGIN&&parent!==window)parent.postMessage({type:'pixel:browser:'+type,message},window.PORTAL_ORIGIN);};
 async function step(message,operation,ms=20000){report('progress',message);let timer;try{return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message+' Timed out. Press Retry to start a fresh connection.')),ms);})]);}finally{clearTimeout(timer);}}
 try{
  const params=new URLSearchParams(location.hash.slice(1)),ticket=params.get('ticket'),initial=params.get('url'),adblock=params.get('adblock')!=='0';history.replaceState(null,'',location.pathname);
  if(!ticket)throw Error('Open Scramjet from Pixel Arcade and sign in to start a session.');
  const encoded=ticket.split('.')[0].replace(/-/g,'+').replace(/_/g,'/'),ticketData=JSON.parse(atob(encoded));
  window.PORTAL_ORIGIN=new URL(ticketData.origin).origin;if(!['http:','https:'].includes(new URL(window.PORTAL_ORIGIN).protocol))throw Error('Invalid browser session.');
  if(ticketData.exp*1000<=Date.now())throw Error('Your browser session expired. Press Retry for a fresh connection.');
  if(!window.isSecureContext||!navigator.serviceWorker)throw Error('Scramjet needs an HTTPS browser context with service workers enabled.');
  if(typeof $scramjetLoadController!=='function'||!window.BareMux)throw Error('Scramjet client files did not load. Your network may be blocking the browser service.');
  const {ScramjetController}=$scramjetLoadController();
  const controller=new ScramjetController({prefix:'/service/',files:{wasm:'/scram/scramjet.wasm.wasm',all:'/scram/scramjet.all.js',sync:'/scram/scramjet.sync.js'},flags:{syncxhr:false}});
  await step('Initializing Scramjet storage…',()=>controller.init());
  await step('Starting the Scramjet service worker…',async()=>{
   await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready;
   if(!navigator.serviceWorker.controller)await new Promise(resolve=>{const ready=()=>{if(navigator.serviceWorker.controller){navigator.serviceWorker.removeEventListener('controllerchange',ready);resolve();}};navigator.serviceWorker.addEventListener('controllerchange',ready);ready();});
  });
  const connection=new BareMux.BareMuxConnection('/baremux/worker.js');
  await step('Connecting the Scramjet transport…',()=>connection.setTransport('/epoxy-adapter.mjs?v=adblock-1',[{adblock,wisp:(location.protocol==='https:'?'wss://':'ws://')+location.host+'/wisp/'+encodeURIComponent(ticket)+'/'}]));
  await step('Testing the encrypted browser connection…',async()=>{
   const client=new BareMux.BareClient('/baremux/worker.js'),response=await client.fetch(new URL('/health',location.origin));
   if(!response.ok||(await response.json()).ok!==true)throw Error('The browser transport health check failed. Press Retry to reconnect.');
  });
  const frame=controller.createFrame();frame.frame.title='Proxied website';document.body.append(frame.frame);
  function go(value){const url=new URL(value);if(!['https:','http:'].includes(url.protocol))throw Error('Only web addresses are supported.');frame.go(url.href);}
  frame.addEventListener('urlchange',event=>parent.postMessage({type:'pixel:browser:url',url:String(event.url)},window.PORTAL_ORIGIN));
  window.addEventListener('message',event=>{if(event.origin!==window.PORTAL_ORIGIN||event.source!==parent)return;const data=event.data;try{if(data?.type==='pixel:browser:go')go(data.url);else if(data?.type==='pixel:browser:back')frame.back();else if(data?.type==='pixel:browser:forward')frame.forward();else if(data?.type==='pixel:browser:reload')frame.reload();}catch(error){report('error',error.message);}});
  if(initial)go(initial);report('ready','Scramjet transport verified. Loading the website…');
 }catch(error){report('error',error.message||'The browser engine could not start.');}
})();
