export function score(query, value) {
  const q=String(query).toLowerCase().trim().replace(/\s+/g,' ');
  const s=String(value).toLowerCase();
  if(!q)return 0;
  if(s===q)return 120;
  if(s.startsWith(q))return 100;
  if(s.includes(q))return 80;
  if(q.split(' ').every(word=>s.includes(word)))return 65;
  let cursor=0,first=-1,last=-1;
  for(let i=0;i<s.length&&cursor<q.length;i++)if(s[i]===q[cursor]){if(first===-1)first=i;last=i;cursor++;}
  if(cursor===q.length)return Math.max(15,55-(last-first-q.length+1)*2-first);
  if(q.length<3||q.length>64)return -1;
  for(const word of s.split(/[^a-z0-9]+/).filter(Boolean)){
    if(Math.abs(word.length-q.length)>1)continue;
    let i=0,j=0,edits=0;
    while(i<q.length&&j<word.length){if(q[i]===word[j]){i++;j++;continue;}if(++edits>1)break;if(q.length>=word.length)i++;if(word.length>=q.length)j++;}
    if(edits+q.length-i+word.length-j<=1)return 30;
  }
  return -1;
}

export function choose(games,category='All games',random=Math.random){
  const pool=games.filter(g=>category==='All games'||g.cat===category);
  return pool.length?pool[Math.min(pool.length-1,Math.max(0,Math.floor(random()*pool.length)))]:null;
}

export function mergeHistory(rows,entry,limit=40){
  return [entry,...rows.filter(r=>r.id!==entry.id)].sort((a,b)=>b.lastPlayed-a.lastPlayed).slice(0,limit);
}

export function elapsed(previous,now,visible){
  return visible?Math.max(0,Math.min(30000,now-previous)):0;
}
