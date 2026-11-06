// A conservative host-only list: game, login and streaming hosts stay untouched.
const adHosts = [
 'doubleclick.net','googlesyndication.com','googleadservices.com',
 'adservice.google.com','adsrvr.org','adnxs.com','criteo.com','criteo.net',
 'pubmatic.com','openx.net','rubiconproject.com','taboola.com','outbrain.com',
 'unityads.unity3d.com','applovin.com','adcolony.com'
];
export function isAdRequest(value){
 try{
  const url=new URL(value);if(!['http:','https:'].includes(url.protocol))return false;
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  return adHosts.some(domain=>host===domain||host.endsWith('.'+domain));
 }catch{return false;}
}
export function blockedAdResponse(){return {status:204,statusText:'No Content',headers:{},body:null};}
