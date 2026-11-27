import {cp,readdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=dirname(fileURLToPath(import.meta.url));

export async function prepareLocalGames(directory){
 const library=JSON.parse(await readFile(join(root,'local-library.json'),'utf8'));
 if(!Array.isArray(library.games)||!library.games.length)throw Error('Local game library is empty.');
 for(const game of library.games){
  if(!game.local||!/^\.\/(?:oss-games\/[a-z0-9-]+\/index\.html|hextris\.html|slope\.html|q2\.html)$/.test(game.embed))throw Error('Nonlocal game in local library: '+game.id);
 }
 const source=join(root,'oss-games'),destination=join(directory,'oss-games');
 await cp(source,destination,{recursive:true,force:true});
 const files=(await readdir(destination,{recursive:true,withFileTypes:true}))
  .filter(entry=>entry.isFile())
  .map(entry=>join('oss-games',relative(destination,entry.parentPath),entry.name).replaceAll('\\','/'));
 await writeFile(join(directory,'catalog.js'),'window.gameCatalog='+JSON.stringify(library.games)+';\n');
 await writeFile(join(directory,'originals.json'),'[]\n');
 await writeFile(join(directory,'embed-sources.json'),'{}\n');
 return files;
}
