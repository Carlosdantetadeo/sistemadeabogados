import {copyFileSync,existsSync,readFileSync} from 'node:fs';
const source=new URL('../../../contracts/openapi.yaml',import.meta.url),target=new URL('../src/contract.json',import.meta.url);
if(existsSync(source))copyFileSync(source,target);
else if(!existsSync(target)||JSON.parse(readFileSync(target,'utf8')).info.version!=='2.0.0')throw new Error('A committed v2 contract snapshot is required.');
