// Real-browser smoke test for the main Arcade homepage.
// Run: npm install --no-save --package-lock=false playwright && npx playwright install chromium
import {chromium} from 'playwright';
import {once} from 'node:events';
import {createPortal} from './server.mjs';
import assert from 'node:assert/strict';

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
  return !!panel&&!panel.hidden&&names.includes('Kerbal Space Program')&&names.includes('Plague Inc: Evolved');
 },{timeout:30000});
 const result=await page.evaluate(()=>({
  base:document.baseURI,
  section:document.body.dataset.section,
  visible:!document.querySelector('#px-webports-page')?.hidden,
  count:document.querySelectorAll('#px-webports-page .px-webports-card').length,
  nav:!!document.querySelector('#side-nav [data-section="webports"]'),
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
 assert.equal(result.nav,true);
 assert.equal(result.count,18);
 assert.ok(result.names.includes('Kerbal Space Program'));
 assert.ok(result.names.includes('Plague Inc: Evolved'));
 console.log('PASS: All Webported Games displayed on the actual Arcade homepage.');
} finally {
 if(browser)await browser.close();
 await app.close();
}
