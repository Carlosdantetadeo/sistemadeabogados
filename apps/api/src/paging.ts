import {createHash} from 'node:crypto';
import {requireThat} from './errors.js';
import {User} from './policy.js';
export function pagination(q:Record<string,any>,u:User,operation:string){
  const limit=Math.min(Number(q.limit||25),100);const filters={...q};delete filters.cursor;
  const scope=createHash('sha256').update(JSON.stringify([u.id,u.firm_id,u.role,operation,Object.entries(filters).sort()])).digest('hex');
  let offset=0;
  if(q.cursor){try{const c=JSON.parse(Buffer.from(q.cursor,'base64url').toString());requireThat(c.scope===scope&&Number.isSafeInteger(c.offset)&&c.offset>=0,400,'INVALID_CURSOR','El cursor no coincide con esta consulta.');offset=c.offset;}catch{requireThat(false,400,'INVALID_CURSOR','Cursor no válido.');}}
  return {limit,offset,page<T>(rows:T[],extra:Record<string,unknown>={}){return {items:rows.slice(0,limit),nextCursor:rows.length>limit?Buffer.from(JSON.stringify({scope,offset:offset+limit})).toString('base64url'):null,...extra};}};
}
