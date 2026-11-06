import {readFile,writeFile} from 'node:fs/promises';
// Wisp 0.4.1 stores streams by ID; its host limiter must iterate the values.
// Keep both connection limits enabled rather than bypassing the broken check.
export async function prepareWisp(){
 const file=new URL('../server/filter.mjs',import.meta.resolve('@mercuryworkshop/wisp-js/server'));
 const original='for (let stream of connection.streams)';
 const fixed='for (let stream of Object.values(connection.streams))';
 const source=await readFile(file,'utf8');
 if(source.includes(fixed))return;
 if(!source.includes(original))throw Error('Wisp host limiter needs compatibility review.');
 await writeFile(file,source.replace(original,fixed));
}
