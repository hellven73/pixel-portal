import {readFile,writeFile,mkdir,rm,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const base='/pixel/',out='github-pages-dist';
await rm(out,{recursive:true,force:true});await mkdir(join(out,'arcade'),{recursive:true});await mkdir(join(out,'portal'),{recursive:true});
const manifest=JSON.parse(await readFile('arcade-manifest.json','utf8'));
const removed=['native-games.html','native-games.js','table-games.html','table-games.js','chess-app.js','chess-worker.js'];
for(const name of manifest.files){if(name.startsWith('backend-')||/\.(ts|sql)$|\.test\.mjs$/.test(name)||removed.includes(name)||['README.md','BACKEND.md'].includes(name))continue;await copyFile(join('arcade-source',name),join(out,'arcade',name));}
await copyFile('github-api-client.js',join(out,'arcade','api-client.js'));
for(const name of ['integration.js','renovation.js']){const file=join(out,'arcade',name);let s=await readFile(file,'utf8');s=s.replaceAll("'/portal",`'${base}portal/index.html`).replaceAll("'/catalogue.json",`'${base}catalogue.json`).replaceAll("fetch('/arcade-api/status')","window.pixelApi.request('/api/status')");await writeFile(file,s);}
for(const name of ['catalogue.json','webports.json','webports-home.js','webports-home.css']){let s=await readFile(name,'utf8');if(name==='webports-home.js')s=s.replaceAll("'/webports.json",`'${base}webports.json`);await writeFile(join(out,name),s);}
let html=await readFile('arcade-source/index.html','utf8');
const css=await readFile('loading-screen.css','utf8'),loader=await readFile('loading-screen.html','utf8'),js=await readFile('loading-screen.js','utf8');
html=html.replace(/<base\b[^>]*>/gi,'').replace('<head>',`<head><base href="${base}arcade/"><script>document.documentElement.classList.add("pixel-loading-enabled")</script><style>${css}</style>`).replace(/<body\b[^>]*>/i,tag=>tag+`${loader}<script>${js}</script>`).replace('</head>',`<link rel="stylesheet" href="${base}webports-home.css?v=2"></head>`).replace('</body>',`<script src="${base}webports-home.js?v=2" defer></script></body>`);
await writeFile(join(out,'index.html'),html);await writeFile(join(out,'arcade','index.html'),html);
for(const name of ['index.html','app.js','services.js','community.js','style.css','game-policy.js','icon.svg','shop-data.json','catalogue.json','webports.json']){let s=await readFile(name,'utf8');if(name==='index.html')s=s.replace('<head>',`<head><base href="${base}portal/">`);if(name==='services.js')s=s.replace("new URL('api/'+path,document.baseURI)","new URL('https://pixelarcade.com.au/api/'+path)");await writeFile(join(out,'portal',name),s);}
await writeFile(join(out,'.nojekyll'),'');
await writeFile(join(out,'404.html'),`<!doctype html><meta charset="utf-8"><title>Pixel Arcade</title><p>This page could not be found. <a href="${base}">Back to Pixel Arcade</a></p>`);
execFileSync('tar',['-czf','site.tar.gz','-C',out,'.']);
console.log('Built public frontend only. Account services remain on pixelarcade.com.au.');
