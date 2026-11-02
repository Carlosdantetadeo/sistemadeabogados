export class ApiError extends Error {constructor(public status:number,public code:string,message:string,public fields?:Record<string,string>){super(message);}}
export function requireThat(value:unknown,status=422,code='INVALID_STATE',message='La operación no cumple sus condiciones.'):asserts value {if(!value)throw new ApiError(status,code,message);}
export const unavailable=(name:string)=>new ApiError(503,'SERVICE_NOT_CONFIGURED',`${name} no está configurado.`);
export const missing=()=>new ApiError(404,'NOT_FOUND','Contenido no disponible.');
