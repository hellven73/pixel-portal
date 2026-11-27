import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {enhanceArcadeHome,homeMotionFiles} from './arcade-home.mjs';
test('motion polish is delivered through the shared home asset pipeline',async()=>{
 const html=enhanceArcadeHome('<html><head></head><body></body></html>');
 for(const name of ['motion-polish.css','motion-polish.js']){
  assert.ok(homeMotionFiles.has(name));
  assert.ok(html.includes(name+'?v=1'));
  assert.ok((await readFile(new URL('./motion/'+name,import.meta.url),'utf8')).length>100);
 }
 const css=await readFile(new URL('./motion/motion-polish.css',import.meta.url),'utf8');
 assert.match(css,/prefers-reduced-motion: no-preference/);
 assert.doesNotMatch(css,/transition:\s*all/);
});
