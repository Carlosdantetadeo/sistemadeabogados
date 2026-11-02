import {Postgres} from './db.js';
import {Runtime} from './runtime.js';
import {S3Storage} from './storage.js';
import {createApp} from './app.js';
async function bootstrap(){
 if(!process.env.APP_ORIGIN)throw new Error('APP_ORIGIN is required');
 const runtime=new Runtime(new Postgres(),new S3Storage());
 const app=await createApp(runtime);await app.listen(Number(process.env.PORT||3000));
}
bootstrap().catch(error=>{console.error(JSON.stringify({code:'BOOT_FAILED',type:error instanceof Error?error.name:'Error'}));process.exitCode=1;});
