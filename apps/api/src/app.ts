import 'reflect-metadata';
import {Controller,All,Req,Res,Module,Inject} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import type {NestExpressApplication} from '@nestjs/platform-express';
import {randomUUID} from 'node:crypto';
import type {Request,Response} from 'express';
import helmet from 'helmet';
import {Runtime} from './runtime.js';
@Controller()
class ApiController {
 constructor(@Inject('RUNTIME') private readonly runtime:Runtime){}
 @All('{*path}') async handle(@Req() req:Request,@Res() res:Response){return this.runtime.execute(req,res);}
}
@Module({})
class AppModule {}
export async function createApp(runtime:Runtime){
 const app=await NestFactory.create<NestExpressApplication>({module:AppModule,controllers:[ApiController],providers:[{provide:'RUNTIME',useValue:runtime}]},{logger:['error','warn'],bodyParser:true});
 app.useBodyParser('json',{limit:'1mb'});
 app.useGlobalFilters({catch(error:any,host:any){const res=host.switchToHttp().getResponse();if(res.headersSent){res.end();return;}const status=typeof error?.getStatus==='function'?error.getStatus():Number(error?.status)||500;const requestId=randomUUID();res.setHeader('Cache-Control','no-store');res.status(status).json({code:status===413?'PAYLOAD_TOO_LARGE':status===400?'INVALID_REQUEST':'REQUEST_FAILED',message:status<500?'Solicitud no válida.':'No se pudo completar la solicitud.',requestId});}});
 app.getHttpAdapter().getInstance().disable('x-powered-by');app.use(helmet());app.enableCors({origin:process.env.APP_ORIGIN,credentials:true,methods:['GET','POST','PATCH','PUT','OPTIONS'],allowedHeaders:['Content-Type','X-CSRF-Token','Idempotency-Key','Range'],exposedHeaders:['Content-Range','Accept-Ranges','X-Request-Id']});
 return app;
}
