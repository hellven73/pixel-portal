// Real-browser smoke test for the main Arcade homepage.
// Run: npm install --no-save --package-lock=false playwright && npx playwright install chromium
import {chromium} from 'playwright';
import {once} from 'node:events';
import {createPortal} from './server.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const app=await createPortal({dbPath:':memory:'});
let browser;
try {
 app.server.listen(0,'127.0.0.1');
 await once(app.server,'listening');
 const base='http://127.0.0.1:'+app.server.address().port+'/';
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 const consoleErrors=[];
 page.on('pageerror',error=>consoleErrors.push(error.message));
 await page.goto(base+'#webports',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>{
  const panel=document.querySelector('#px-webports-page');
  const names=Array.from(panel?.querySelectorAll('h3')||[]).map(n=>n.textContent);
  return !!panel&&!panel.hidden&&names.includes('2048')&&names.includes('Tetris');
 },{timeout:30000});
 const result=await page.evaluate(()=>({
  base:document.baseURI,
  section:document.body.dataset.section,
  visible:!document.querySelector('#px-webports-page')?.hidden,
  count:document.querySelectorAll('#px-webports-page .px-webports-card').length,
  emojiDuplicate:!!document.querySelector('#side-nav .px-webports-nav-icon'),
  names:[...document.querySelectorAll('#px-webports-page h3')].map(n=>n.textContent)
 }));
 const navButtons=await page.locator('#side-nav button').evaluateAll(items=>items.map(e=>({label:e.textContent.trim(),dataset:e.dataset.section,html:e.outerHTML.slice(0,280)})).filter(v=>/webport/i.test(v.label)));
 console.log('WEBPORT NAV ELEMENTS:',JSON.stringify(navButtons));
 const otherLinks=await page.evaluate(()=>[...document.querySelectorAll('a,button,summary,[role="button"]')].filter(e=>/webport/i.test(e.textContent)).map(e=>({tag:e.tagName,section:e.dataset.section,html:e.outerHTML.slice(0,500),parents:[e.parentElement?.className,e.parentElement?.parentElement?.className]})).slice(0,16));
 console.log('ALL WEBPORT LINK ELEMENTS:',JSON.stringify(otherLinks));

  console.log('REAL BROWSER HOMEPAGE:',JSON.stringify(result));
 console.log('PAGE ERRORS:',JSON.stringify(consoleErrors.slice(0,15)));
 assert.equal(new URL(result.base).pathname,'/arcade/');
 assert.equal(result.section,'webports');
 assert.equal(result.visible,true);
 assert.equal(result.emojiDuplicate,false);
 const catalogue=JSON.parse(await readFile(new URL('./webports.json',import.meta.url),'utf8'));
 const expected=catalogue.games.filter(game=>game.local===true&&game.url.startsWith('./')).map(game=>game.name);
 assert.equal(result.count,expected.length);
 assert.deepEqual(result.names,expected);
 assert.equal(await page.locator('a[download="quake-ii-offline.tar.gz"]').count(),1);
 const script=await page.request.get(base+'arcade/motion-polish.js');
 const style=await page.request.get(base+'arcade/motion-polish.css');
 assert.equal(script.status(),200);
 assert.equal(style.status(),200);
 const fixture=await browser.newPage({reducedMotion:'no-preference'});
 await fixture.setContent('<section id="home-page">Home</section><section id="media-page" hidden>Media</section>');
 await fixture.addScriptTag({content:await script.text()});
 await fixture.evaluate(()=>{document.querySelector('#home-page').hidden=true;document.querySelector('#media-page').hidden=false;document.body.dataset.section='media'});
 await fixture.waitForFunction(()=>document.querySelector('#media-page').getAnimations().length===1);
 await fixture.emulateMedia({reducedMotion:'reduce'});
 await fixture.waitForFunction(()=>document.querySelector('#media-page').getAnimations().length===0);
 await fixture.evaluate(()=>{document.querySelector('#home-page').hidden=false;document.querySelector('#media-page').hidden=true;document.body.dataset.section='home'});
 await fixture.waitForTimeout(50);
 await fixture.evaluate(()=>{document.querySelector('#home-page').hidden=true;document.querySelector('#media-page').hidden=false;document.body.dataset.section='media'});
 await fixture.waitForTimeout(50);
 assert.equal(await fixture.locator('#media-page').evaluate(el=>el.getAnimations().length),0);
 await fixture.close();
 assert.ok(result.names.includes('2048'));
 assert.ok(result.names.includes('Tetris'));
 console.log('PASS: All first-party games displayed on the actual Arcade homepage.');
} finally {
 if(browser)await browser.close();
 await app.close();
}
