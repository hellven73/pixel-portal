import {prepareArcade} from './arcade-runtime.mjs';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
const {directory,files}=await prepareArcade();
for(const name of files)if(/\.(js|mjs)$/.test(name)){
 const source=await readFile(join(directory,name),'utf8');
 const module=name.endsWith('.mjs')||/^\s*(import\s|export\s)/m.test(source);
 execFileSync(process.execPath,['--check','--input-type='+ (module?'module':'commonjs')],{input:source,stdio:['pipe','pipe','pipe']});
}
console.log('Arcade JavaScript syntax checks passed.');
