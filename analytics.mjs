export const measurementId='G-6Y3DXZJTDB';
export const containerId='GTM-WR7WV87V';
export const googleTag=`<!-- Google Tag Manager -->
<script async src="https://www.googletagmanager.com/gtm.js?id=${containerId}"></script>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${measurementId}');
</script>`;

export function withGoogleTag(html){
 const clean=String(html).replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,(tag,attrs,body)=>
  /\bsrc\s*=\s*["'][^"']*googletagmanager\.com\/(?:gtag\/js|gtm\.js)(?:\?|["'])/i.test(attrs)||/\bgtag\s*\(\s*["'](?:config|js)["']/i.test(body)?'':tag);
 if(/<head\b[^>]*>/i.test(clean))return clean.replace(/<head\b[^>]*>/i,head=>head+'\n'+googleTag+'\n');
 return clean.replace(/^(<!doctype[^>]*>)?/i,(_,doctype='')=>doctype+'<head>\n'+googleTag+'\n</head>');
}
