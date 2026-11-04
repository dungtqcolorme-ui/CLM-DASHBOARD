import test from 'node:test';import assert from 'node:assert/strict';
import {routeLoader} from './helpers/load-route.mjs';
const id='11111111-1111-4111-8111-111111111111',factId='22222222-2222-4222-8222-222222222222';
function fixture({roles=['PR Representative'],status='active',rpcError=null,readError=null}={}){
 const calls=[],tables={};
 const client={from(table){calls.push(table);let start=0,end=499;const q={select(){return q;},order(){return q;},range(a,b){start=a;end=b;return q;},then(resolve){return Promise.resolve({data:(tables[table]??[]).slice(start,end+1),count:(tables[table]??[]).length,error:readError}).then(resolve);}};return q;},async rpc(name,args){calls.push({name,args});return {data:{id,...args.p_command},error:rpcError};}};
 const load=routeLoader({'@/lib/dashboardSession':{getDashboardRequestIdentity:async request=>{if(request.headers.get('authorization')!=='Bearer valid')throw Object.assign(new Error('invalid'),{status:401});if(status!=='active')throw Object.assign(new Error('locked'),{status:403});return {profile:{id,roles,status},client};}}});
 let route={};try{route=load('app/api/marketing/knowledge/route.ts');}catch(e){if(e.code!=='ENOENT')throw e;}
 return {route,calls,tables};
}
const req=(body,headers={})=>new Request('https://clm.example/api/marketing/knowledge',{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const source={action:'create_source',team_id:id,title:'Nguồn',kind:'member_brief',url:null,excerpt:'Brief kiểm thử',author:null,published_at:null};
test('Knowledge HTTP requires verified active identity and forbids Viewer writes',async()=>{
 const f=fixture();assert.equal(typeof f.route.GET,'function');assert.equal((await f.route.GET(new Request('https://clm.example/api/marketing/knowledge'))).status,401);assert.equal(f.calls.length,0);
 const locked=fixture({status:'locked'});assert.equal((await locked.route.POST(req(source))).status,403);assert.equal(locked.calls.length,0);
 const viewer=fixture({roles:['Viewer']});assert.equal((await viewer.route.POST(req(source,{'X-CLM-Active-Role':'Admin'}))).status,403);assert.equal(viewer.calls.length,0);
});
test('Knowledge GET is RLS scoped and advertises only actual internal capability',async()=>{
 const f=fixture();assert.equal(typeof f.route.GET,'function');
 const r=await f.route.GET(new Request('https://clm.example/api/marketing/knowledge',{headers:{Authorization:'Bearer valid'}}));assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);
 const body=await r.json();assert.deepEqual(body.sources,[]);assert.deepEqual(body.ideas,[]);assert.equal(body.capabilities.internal_research,'available');assert.equal(body.capabilities.ai_generation,'not_configured');assert.equal(body.capabilities.external_research,'not_configured');
});
test('Knowledge POST validates allowlist and sends only bounded normalized user command to RPC',async()=>{
 const f=fixture();assert.equal(typeof f.route.POST,'function');assert.equal((await f.route.POST(req(source))).status,200);assert.deepEqual(f.calls,[{name:'marketing_knowledge_command',args:{p_command:source}}]);
 assert.equal((await f.route.POST(req({...source,status:'approved'}))).status,400);assert.equal((await f.route.POST(req({action:'invoke_mcp',tool:'publish'}))).status,400);assert.equal((await f.route.POST(req(source,{Origin:'https://evil.test'}))).status,403);assert.equal(f.calls.length,1);
});
test('Source/fact review checks actual manager roles, never the selected-role header',async()=>{
 const f=fixture();assert.equal(typeof f.route.POST,'function');const review={action:'review_source',id,expected_version:1,decision:'approve',reason:'Đã đối chiếu'};
 assert.equal((await f.route.POST(req(review,{'X-CLM-Active-Role':'Admin'}))).status,403);assert.equal(f.calls.length,0);
 const leader=fixture({roles:['PR Leader']});assert.equal((await leader.route.POST(req(review))).status,200);
});
test('Knowledge conflicts/schema/errors are mapped and never echo database secrets',async()=>{
 for(const [rpcError,status,code]of [[{code:'40001',message:'private'},409,'conflict'],[{code:'42501',message:'private'},403,'forbidden'],[{code:'PGRST202',message:'private'},503,'schema_unavailable'],[{code:'XX000',message:'private'},500,'internal_error']]){
  const f=fixture({rpcError});assert.equal(typeof f.route.POST,'function');const r=await f.route.POST(req(source));assert.equal(r.status,status);const body=await r.json();assert.equal(body.code,code);assert.equal(JSON.stringify(body).includes('private'),false);
 }
});
test('Knowledge refuses oversized/malformed requests without touching database',async()=>{
 const f=fixture();assert.equal(typeof f.route.POST,'function');assert.equal((await f.route.POST(req('x'.repeat(262145)))).status,413);assert.equal((await f.route.POST(req('{'))).status,400);assert.equal((await f.route.POST(req('{}',{'Content-Type':'text/plain'}))).status,415);assert.equal(f.calls.length,0);
});
test('Revoked source and generated captions are redacted but stale version refs remain detectable',async()=>{
 const f=fixture();assert.equal(typeof f.route.GET,'function');
 f.tables.marketing_sources=[{id,team_id:'team',version:2,status:'revoked',excerpt:'REVOKED_PRIVATE_EXCERPT'}];
 f.tables.marketing_facts=[{id:factId,source_id:id,team_id:'team',version:1,status:'verified',claim_type:'fact',category:'general',valid_until:null,claim:'REVOKED_PRIVATE_FACT'}];
 const ref={source_id:id,source_version:1,fact_id:factId,fact_version:1};
 f.tables.marketing_ideas=[{id:'idea',origin:'rule_based',evidence:[ref],title:'REVOKED_PRIVATE_TITLE',caption:'REVOKED_PRIVATE_CAPTION',hook:'REVOKED_PRIVATE_HOOK',objective:'REVOKED_PRIVATE_OBJECTIVE',rationale:'REVOKED_PRIVATE_RATIONALE'}];
 const r=await f.route.GET(new Request('https://clm.example/api/marketing/knowledge',{headers:{Authorization:'Bearer valid'}}));assert.equal(r.status,200);const body=await r.json();assert.equal(JSON.stringify(body).includes('REVOKED_PRIVATE'),false);assert.deepEqual(body.ideas[0].evidence,[ref]);assert.equal(body.sources[0].status,'revoked');
});
