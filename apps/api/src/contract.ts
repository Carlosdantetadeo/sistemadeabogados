import {Ajv,type ValidateFunction,type Plugin} from 'ajv';
import addFormats from 'ajv-formats';
import contract from './contract.json' with {type:'json'};
import {ApiError,requireThat} from './errors.js';
type Operation={operationId:string;parameters:any[];requestBody?:any;responses:any};
export class Contract {
  readonly spec:any=contract;private validators=new Map<string,ValidateFunction>();
  private routes:{method:string;pattern:RegExp;keys:string[];op:Operation}[]=[];
  constructor(){
    const ajv=new Ajv({strict:false,allErrors:true});(addFormats as unknown as Plugin<undefined>)(ajv);
    ajv.addSchema({...contract,$id:'contract'});
    for(const [name] of Object.entries(contract.components.schemas))this.validators.set(name,ajv.compile({$ref:`contract#/components/schemas/${name}`}));
    for(const [path,methods] of Object.entries(contract.paths))for(const [method,op] of Object.entries(methods)){
      const keys:string[]=[];const pattern=path.replace(/\{([^}]+)\}/g,(_,key)=>{keys.push(key);return '([^/]+)';});
      this.routes.push({method:method.toUpperCase(),pattern:new RegExp('^'+pattern+'/?$'),keys,op:op as Operation});
    }
  }
  match(method:string,path:string){for(const r of this.routes){if(r.method!==method)continue;const m=path.match(r.pattern);if(m)return {op:r.op,params:Object.fromEntries(r.keys.map((k,i)=>[k,m[i+1]]))};}return null;}
  validate(op:Operation,params:Record<string,string>,query:Record<string,unknown>,body:unknown){
    for(const p of op.parameters){const value=p.in==='path'?params[p.name]:p.in==='query'?query[p.name]:undefined;
      if(p.in==='path')requireThat(typeof value==='string'&&/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value),400,'INVALID_ID','Identificador no válido.');
      if(p.in==='query'&&value!==undefined){requireThat(typeof value==='string',400,'INVALID_QUERY','Filtro no válido.');if(p.name==='limit')requireThat(/^\d+$/.test(value)&&+value>=1&&+value<=100,400,'INVALID_LIMIT','Límite entre 1 y 100.');if(p.schema.enum)requireThat(p.schema.enum.includes(value),400,'INVALID_FILTER','Filtro no válido.');if(p.schema.format==='uuid')requireThat(/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value),400,'INVALID_ID','Identificador no válido.');}
    }
    if(op.requestBody){const schema=Object.values(op.requestBody.content)[0] as any;const name=schema.schema.$ref?.split('/').pop();const validator=this.validators.get(name);if(!validator||!validator(body))throw new ApiError(400,'VALIDATION_ERROR','Revisa los campos enviados.',{schema:name});}
  }
  validateResponse(op:Operation,value:unknown){
    const response=op.responses[Object.keys(op.responses).find(k=>k.startsWith('2'))!];
    const schema=response.content?.['application/json']?.schema?.$ref?.split('/').pop();if(!schema)return value;
    const clean=JSON.parse(JSON.stringify(value)),validator=this.validators.get(schema);
    if(!validator||!validator(clean)){console.error(JSON.stringify({code:'RESPONSE_SCHEMA_INVALID',operation:op.operationId,schema,errors:validator?.errors?.map(e=>({path:e.instancePath,keyword:e.keyword,params:e.params}))}));throw new ApiError(500,'RESPONSE_SCHEMA_INVALID','No se pudo completar la respuesta.');}
    return clean;
  }
}
