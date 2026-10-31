import {readFile,readdir,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const files=(await readdir('arcade-source')).sort();
execFileSync('tar',['--sort=name','--mtime=@0','--owner=0','--group=0','-czf','.arcade-app.next.tar.gz','-C','arcade-source',...files.map(name=>'./'+name)]);
await rename('.arcade-app.next.tar.gz','arcade-app.tar.gz');
const archiveSha256=createHash('sha256').update(await readFile('arcade-app.tar.gz')).digest('hex');
await writeFile('arcade-manifest.json',JSON.stringify({source:'https://github.com/hellven73/pixel-arcade',sourceCommit:'24df2de35ee1b4b9b86e1fbc88a8cdce3b401189',archiveSha256,files},null,2)+'\n');
console.log(`Packaged ${files.length} Arcade files.`);
