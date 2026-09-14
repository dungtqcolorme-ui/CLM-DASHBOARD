import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export function routeLoader(overrides){
  const cache=new Map();
  return function load(file){
    const path=resolve(root,file);
    if(cache.has(path))return cache.get(path).exports;
    const loadedModule={exports:{}};cache.set(path,loadedModule);
    const js=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const localRequire=(id)=>{
      if(Object.hasOwn(overrides,id))return overrides[id];
      if(id==='server-only')return {};
      if(id.startsWith('@/'))return load(id.slice(2)+'.ts');
      return require(id);
    };
    new Function('require','module','exports',js)(localRequire,loadedModule,loadedModule.exports);
    return loadedModule.exports;
  };
}
export function databaseFixture(){
  const profiles=[{id:'admin',full_name:'Admin',email:'admin@example.test',status:'active',created_at:'2026-01-01',updated_at:'2026-01-01',last_seen_at:null},{id:'leader',full_name:'Leader',email:'leader@example.test',status:'active',created_at:'2026-01-01',updated_at:'2026-01-01',last_seen_at:null},{id:'staff',full_name:'Trainee',email:'staff@example.test',status:'active',created_at:'2026-01-01',updated_at:'2026-01-01',last_seen_at:null},{id:'viewer',full_name:'Viewer',email:'viewer@example.test',status:'active',created_at:'2026-01-01',updated_at:'2026-01-01',last_seen_at:null}];
  const roles=[{user_id:'admin',role:'Admin'},{user_id:'leader',role:'PR Leader'},{user_id:'staff',role:'PR Representative'},{user_id:'viewer',role:'Viewer'}];
  const tables={profiles,user_roles:roles,tasks:[],task_collaborators:[],meetings:[],meeting_participants:[],work_comments:[],work_history:[],user_notifications:[],notification_dismissals:[]};const authChanges=[];const visits=new Map();let writes=0;
  const admin={from(table){
    let filters=[],operation='read',values,one=false,count=false;
    const query={select(_cols,options){count=!!options?.count;return this;},eq(key,value){filters.push(r=>key==='profiles.status'?profiles.find(p=>p.id===r.user_id)?.status===value:r[key]===value);return this;},is(key,value){filters.push(r=>(r[key]??null)===value);return this;},in(key,list){filters.push(r=>list.includes(r[key]));return this;},update(value){operation='update';values=value;return this;},delete(){operation='delete';return this;},insert(value){operation='insert';values=value;return this;},upsert(value){operation='upsert';values=value;return this;},order(){return this;},limit(){return this;},single(){one=true;return this;},maybeSingle(){one=true;return this;},then(resolve,reject){
      try{let rows=(tables[table]??[]).filter(r=>filters.every(f=>f(r)));if(operation==='update')rows.forEach(r=>Object.assign(r,values));if(operation==='delete'){const kept=tables[table].filter(r=>!rows.includes(r));tables[table].splice(0,tables[table].length,...kept);}if(operation==='insert'){rows=Array.isArray(values)?values:[values];tables[table].push(...rows);}if(operation==='upsert'){rows=(Array.isArray(values)?values:[values]).map(value=>{const existing=value.id&&tables[table].find(r=>r.id===value.id);if(existing)return Object.assign(existing,value);const row={version:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_seen_at:null,...value};tables[table].push(row);return row;});}return Promise.resolve({data:one?(rows[0]??null):rows,error:null,count:count?rows.length:null}).then(resolve,reject);}catch(error){return Promise.reject(error).then(resolve,reject);}
    }};return query;
  },auth:{getUser:async token=>({data:{user:profiles.some(p=>p.id===token)?{id:token}:null},error:null}),admin:{createUser:async value=>{if(profiles.some(p=>p.email===value.email))return {data:{user:null},error:{message:'User already registered'}};const id='44444444-4444-4444-8444-444444444444';authChanges.push({id,...value});return {data:{user:{id}},error:null};},updateUserById:async(id,value)=>{authChanges.push({id,...value});return {data:{user:{id}},error:null};},deleteUser:()=>{throw new Error('Permanent deletion forbidden in this flow');}}},rpc:async(name,args)=>{
    const profile=profiles.find(p=>p.id===args.p_user_id);if(!profile)return {data:null,error:{message:'missing'}};
    if(name==='set_profile_access_status'){profile.status=args.p_status;return {data:args.p_status,error:null};}
    if(name==='record_profile_app_load'){
      const key=args.p_user_id+':'+args.p_load_id;
      if(!visits.has(key)){writes++;visits.set(key,new Date(Date.now()+writes).toISOString());profile.last_seen_at=visits.get(key);}
      return {data:profile.last_seen_at,error:null};
    }
    throw new Error('Unexpected RPC '+name);
  }};
  return {admin,profiles,roles,tables,authChanges,visits,get writes(){return writes;}};
}
