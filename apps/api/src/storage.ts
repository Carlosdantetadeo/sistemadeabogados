import {S3Client,GetObjectCommand,HeadObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {unavailable,requireThat} from './errors.js';
export interface Storage {
  uploadForm(key:string,mime:string,size:number):Promise<{url:string;fields:Record<string,string>;expiresAt:string;method?:string;headers?:Record<string,string>}>;
  head(key:string):Promise<{size:number;mime:string}>;
  read(key:string,range?:{start:number;end:number}):Promise<Buffer>;
  put(key:string,body:Buffer,mime:string):Promise<void>;
}
export class S3Storage implements Storage {
  private get client(){if(!process.env.S3_BUCKET||!process.env.S3_ACCESS_KEY_ID||!process.env.S3_SECRET_ACCESS_KEY)throw unavailable('Almacenamiento privado');return new S3Client({region:process.env.S3_REGION||'auto',endpoint:process.env.S3_ENDPOINT||undefined,forcePathStyle:process.env.S3_FORCE_PATH_STYLE==='true',requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}});}
  async uploadForm(key:string,mime:string,size:number){const url=await getSignedUrl(this.client,new PutObjectCommand({Bucket:process.env.S3_BUCKET!,Key:key,ContentType:mime,ContentLength:size}),{expiresIn:300,signableHeaders:new Set(['content-type','content-length'])});return {url,method:'PUT',headers:{'Content-Type':mime},fields:{},expiresAt:new Date(Date.now()+300000).toISOString()};}
  async head(key:string){const r=await this.client.send(new HeadObjectCommand({Bucket:process.env.S3_BUCKET!,Key:key}));return {size:r.ContentLength||0,mime:r.ContentType||'application/octet-stream'};}
  async read(key:string,range?:{start:number;end:number}){const r=await this.client.send(new GetObjectCommand({Bucket:process.env.S3_BUCKET!,Key:key,Range:range?`bytes=${range.start}-${range.end}`:undefined}));return Buffer.from(await r.Body!.transformToByteArray());}
  async put(key:string,body:Buffer,mime:string){await this.client.send(new PutObjectCommand({Bucket:process.env.S3_BUCKET!,Key:key,Body:body,ContentType:mime}));}
}
export function rangeFor(header:string|undefined,size:number){
  if(!header){requireThat(size<=1024*1024,416,'RANGE_REQUIRED','Descarga este archivo por rangos de hasta 1 MiB, con autorización en cada solicitud.');return undefined;}
  const m=/^bytes=(\d+)-(\d*)$/.exec(header);requireThat(m,416,'INVALID_RANGE','Rango no válido.');const start=Number(m[1]),end=m[2]?Number(m[2]):Math.min(start+1024*1024-1,size-1);requireThat(start>=0&&end>=start&&end<size&&end-start<1024*1024,416,'INVALID_RANGE','El rango debe ser de hasta 1 MiB y estar dentro del archivo.');return {start,end};
}
