(function(root){
 function allowed(game){
  if(!game||game.local!==true||typeof game.url!=='string')return false;
  try{
   const url=new URL(game.url,document.baseURI);
   const rootPath=new URL('../arcade/',document.baseURI);
   return url.origin===location.origin&&url.pathname.startsWith(rootPath.pathname)&&['http:','https:'].includes(url.protocol);
  }catch{return false}
 }
 root.pixelGameAllowed=allowed;
})(globalThis);
