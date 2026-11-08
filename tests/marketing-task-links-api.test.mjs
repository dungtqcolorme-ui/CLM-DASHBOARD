import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLoader } from './helpers/load-route.mjs';
const id='11111111-1111-4111-8111-111111111111';
function fixture({roles=['PR Representative'],content=true,task=true}={}) {
  const calls=[];
  const tables={marketing_content_items:content?[{id,team_id:id}]:[],marketing_task_links:[],tasks:task?[{id:'T-test',title:'Task có sẵn',status:'Đang thực hiện',owner_id:id,deadline:'2026-11-10',version:3}]:[]};
  const client={from(table){calls.push(table);const filters=[];let single=false;const query={
    select(){return query;},eq(key,value){filters.push(row=>row[key]===value);return query;},is(){return query;},in(key,values){filters.push(row=>values.includes(row[key]));return query;},
    order(){return query;},range(){return query;},maybeSingle(){single=true;return query;},
    then(resolve){const rows=(tables[table]??[]).filter(row=>filters.every(filter=>filter(row)));return Promise.resolve({data:single?(rows[0]??null):rows,error:null,count:rows.length}).then(resolve);}
  };return query;},async rpc(name,args){calls.push({name,args});return {data:{id},error:null};}};
  const load=routeLoader({'@/lib/dashboardSession':{getDashboardRequestIdentity:async request=>{
    if(request.headers.get('authorization')!=='Bearer fixture')throw Object.assign(Error('private'),{status:401});
    return {profile:{id,roles},client};
  }}});
  let route={};try{route=load('app/api/marketing/tasks/route.ts');}catch(error){if(error.code!=='ENOENT')throw error;}
  const req=(method,body,query='')=>new Request('https://clm.test/api/marketing/tasks'+query,{method,headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  return {route,calls,tables,req};
}

test('Task lookup checks current content scope and returns only permitted Task metadata',async()=>{
  const f=fixture();assert.equal(typeof f.route.GET,'function');
  assert.equal((await f.route.GET(new Request('https://clm.test/api/marketing/tasks?content_id='+id))).status,401);
  const denied=fixture({content:false});assert.equal((await denied.route.GET(denied.req('GET',null,'?content_id='+id+'&task_id=T-test'))).status,404);
  assert.ok(!denied.calls.includes('tasks'));
  const response=await f.route.GET(f.req('GET',null,'?content_id='+id+'&task_id=T-test'));
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  const data=await response.json();assert.equal(data.lookup.task.title,'Task có sẵn');assert.equal(data.lookup.expected_link_version,0);
  const missing=fixture({task:false});assert.equal((await missing.route.GET(missing.req('GET',null,'?content_id='+id+'&task_id=T-test'))).status,404);
});
test('Task link writes use only the user RPC and reject Viewer or forged fields',async()=>{
  const command={action:'link_task',content_id:id,task_id:'T-test',expected_link_version:0};
  const f=fixture();assert.equal(typeof f.route.POST,'function');
  assert.equal((await f.route.POST(f.req('POST',command))).status,200);
  assert.deepEqual(f.calls,[{name:'marketing_task_command',args:{p_command:command}}]);
  assert.equal((await f.route.POST(f.req('POST',{...command,title:'Overwrite'}))).status,400);
  assert.equal((await f.route.POST(f.req('POST',{...command,task_id:"x';drop"}))).status,400);
  const viewer=fixture({roles:['Viewer']});assert.equal((await viewer.route.POST(viewer.req('POST',command))).status,403);assert.deepEqual(viewer.calls,[]);
});
