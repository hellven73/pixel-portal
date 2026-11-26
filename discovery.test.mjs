import test from 'node:test';
import assert from 'node:assert/strict';
import {score,choose,mergeHistory,elapsed} from './motion/discovery-core.js';
test('fuzzy search prioritizes exact and prefix matches, tolerates missing letters',()=>{
 assert.ok(score('Minecraft','Minecraft')>score('Mine','Minecraft'));
 assert.ok(score('mincraft','Minecraft')>=0);
 assert.ok(score('mcft','Minecraft')>=0);
 assert.equal(score('xyz','Minecraft'),-1);
});
test('roulette filters categories and handles empty pools',()=>{
 const games=[{id:'a',cat:'Arcade'},{id:'b',cat:'Puzzle'}];
 assert.equal(choose(games,'Puzzle',()=>0).id,'b');
 assert.equal(choose(games,'All games',()=>.99).id,'b');
 assert.equal(choose(games,'Missing'),null);
});
test('history deduplicates, sorts, caps and tracks only visible intervals',()=>{
 assert.deepEqual(mergeHistory([{id:'a',lastPlayed:1},{id:'b',lastPlayed:2}],{id:'a',lastPlayed:3},1),[{id:'a',lastPlayed:3}]);
 assert.equal(elapsed(1000,6000,true),5000);
 assert.equal(elapsed(1000,6000,false),0);
 assert.equal(elapsed(0,60000,true),30000);
});
