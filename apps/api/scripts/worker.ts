import {setTimeout as sleep} from 'node:timers/promises';
import {Postgres} from '../src/db.js';
import {S3Storage} from '../src/storage.js';
import {Worker} from '../src/worker.js';
const db=new Postgres(),worker=new Worker(db,new S3Storage());
let stop=false;process.on('SIGTERM',()=>{stop=true;});process.on('SIGINT',()=>{stop=true;});
try{do{await worker.schedule();const result=await worker.runOnce();console.log(JSON.stringify(result));if(process.env.WORKER_ONCE==='true')break;if(!result.processed)await sleep(15000);}while(!stop);}finally{await db.close();}
