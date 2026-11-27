const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const excluded = new Set(['home-page','library-page','px-webports-page','webports-page']);
const duration = 270;
const ease = 'cubic-bezier(.22,1,.36,1)';
const animations = new Set();
let current, frame = 0;
function play(node, frames, options = {}) {
  if (reduced.matches || !node?.animate || !node.isConnected || !node.getClientRects().length) return;
  const a = node.animate(frames,{duration,easing:ease,fill:'none',...options});
  animations.add(a);
  const done = () => animations.delete(a);
  a.finished.then(done,done);
}
function refresh() {
  frame = 0;
  const sections = [...document.querySelectorAll('section[id$="-page"]')];
  const next = sections.find(s=>!s.hidden && !s.closest('[hidden]') && s.getClientRects().length);
  if (next === current) return;
  const previous = current;
  current = next;
  for (const a of animations) a.cancel();
  if (!previous || !next || excluded.has(next.id) || reduced.matches || document.querySelector('#player[open]') || document.body.classList.contains('game-tab')) return;
  play(next,[{opacity:.68,translate:'0 7px'},{opacity:1,translate:'none'}]);
}
function queue() { if (!frame) frame = requestAnimationFrame(refresh); }
function start() {
  if (new URLSearchParams(location.search).get('gameview')==='1') return;
  refresh();
  const observer = new MutationObserver(queue);
  observer.observe(document.body,{attributes:true,attributeFilter:['data-section']});
  for (const section of document.querySelectorAll('section[id$="-page"]')) observer.observe(section,{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('click',event=>{
    if (reduced.matches || !(event.target instanceof Element) || event.detail!==0 || document.querySelector('#player[open]')) return;
    const button=event.target.closest('.px-feature-dialog button,.px-desk-toolbar button,.px-next-actions button');
    if (button && !button.disabled && !button.hasAttribute('data-px-motion-surface')) play(button,[{scale:1},{scale:.96,offset:.35},{scale:1}],{duration:220});
  },true);
  reduced.addEventListener('change',()=>{if(reduced.matches)for(const a of animations)a.cancel();});
}
if (document.body.classList.contains('arcade-booting')) document.addEventListener('pixel-interface-ready',start,{once:true}); else start();
