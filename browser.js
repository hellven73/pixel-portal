'use strict';
(async()=>{
 const status=document.getElementById('status');
 try{
 const params=new URLSearchParams(location.hash.slice(1)),ticket=params.get('ticket'),initial=params.get('url');history.replaceState(null,'',location.pathname);
 if(!ticket)throw new Error('Open the browser from Pixel Portal to start a session.');
 const encoded=ticket.split('.')[0].replace(/-/g,'+').replace(/_/g,'/');const ticketData=JSON.parse(atob(encoded));window.PORTAL_ORIGIN=new URL(ticketData.origin).origin;if(!['http:','https:'].includes(new URL(window.PORTAL_ORIGIN).protocol))throw new Error('Invalid browser session.');
 if(!window.isSecureContext)throw new Error('The browser needs HTTPS, or localhost for development.');
 const {ScramjetController}=$scramjetLoadController();const controller=new ScramjetController({prefix:'/service/',files:{wasm:'/scram/scramjet.wasm.wasm',all:'/scram/scramjet.all.js',sync:'/scram/scramjet.sync.js'}});await controller.init();
 await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready;
 const connection=new BareMux.BareMuxConnection('/baremux/worker.js');await connection.setTransport('/libcurl/index.mjs',[{websocket:(location.protocol==='https:'?'wss://':'ws://')+location.host+'/wisp/?ticket='+encodeURIComponent(ticket)}]);
 const frame=controller.createFrame();frame.frame.title='Proxied website';document.body.append(frame.frame);
 function go(value){let u;try{u=new URL(value);}catch{throw new Error('Enter a valid website address.');}if(!['https:','http:'].includes(u.protocol))throw new Error('Only web addresses are supported.');frame.go(u.href);}
 frame.addEventListener('urlchange',event=>parent.postMessage({type:'pixel:browser:url',url:String(event.url)},window.PORTAL_ORIGIN));
 window.addEventListener('message',event=>{if(event.origin!==window.PORTAL_ORIGIN||event.source!==parent)return;const data=event.data;try{if(data?.type==='pixel:browser:go')go(data.url);else if(data?.type==='pixel:browser:back')frame.back();else if(data?.type==='pixel:browser:forward')frame.forward();else if(data?.type==='pixel:browser:reload')frame.reload();}catch(e){parent.postMessage({type:'pixel:browser:error',message:e.message},window.PORTAL_ORIGIN);}});
 if(initial)go(initial);status.hidden=true;parent.postMessage({type:'pixel:browser:ready'},window.PORTAL_ORIGIN);
 }catch(error){status.textContent=error.message;parent.postMessage({type:'pixel:browser:error',message:error.message},window.PORTAL_ORIGIN);}
})();
