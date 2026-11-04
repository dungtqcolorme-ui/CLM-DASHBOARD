import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLoader } from './helpers/load-route.mjs';
const id='11111111-1111-4111-8111-111111111111';
function fixture({status='active',roles=['PR Representative'],rpcError=null,readError=null,maxRows=1000}={}) {
  const calls=[];
  const tables={marketing_teams:[{id,name:'Partnership'}],marketing_team_memberships:[{team_id:id,user_id:'staff'}],marketing_campaigns:[],marketing_content_items:[],marketing_revisions:[]};
  const client={from(table){calls.push({table});let start=0,end=maxRows-1;const q={select(){return q;},order(){return q;},limit(n){end=Math.min(n-1,maxRows-1);return q;},range(from,to){start=from;end=Math.min(to,from+maxRows-1);return q;},eq(){return q;},then(resolve){return Promise.resolve({data:(tables[table]??[]).slice(start,end+1),error:readError,count:(tables[table]??[]).length}).then(resolve);}};return q;},async rpc(name,args){calls.push({name,args});return {data:{id,...args.p_command},error:rpcError};}};
  const identity={profile:{id:'staff',fullName:'Staff',roles,status,email:'staff@example.test'},client};
  const load=routeLoader({'@/lib/dashboardSession':{getDashboardRequestIdentity:async request=>{if(request.headers.get('authorization')!=='Bearer valid'){const e=new Error('Phiên đăng nhập không hợp lệ.');e.status=401;throw e;}if(status!=='active'){const e=new Error('Tài khoản không hoạt động.');e.status=403;throw e;}return identity;}}});
  let route;try{route=load('app/api/marketing/route.ts');}catch(e){if(e.code!=='ENOENT')throw e;route={};}
  return {route,calls,tables};
}
function request(payload,headers={}) {return new Request('https://clm.example/api/marketing',{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json',...headers},body:typeof payload==='string'?payload:JSON.stringify(payload)});}
test('Marketing API requires verified identity for reads and writes',async()=>{
  const f=fixture();assert.equal(typeof f.route.GET,'function');
  assert.equal((await f.route.GET(new Request('https://clm.example/api/marketing'))).status,401);
  assert.equal((await f.route.POST(request({action:'create_team',name:'Team'},{Authorization:'Bearer fake'}))).status,401);
  assert.equal(f.calls.length,0);
  const locked=fixture({status:'locked'});assert.equal((await locked.route.POST(request({action:'create_team',name:'Team'}))).status,403);assert.equal(locked.calls.length,0);
});
test('Marketing GET queries RLS user client and returns only true capability states',async()=>{
  const f=fixture();assert.equal(typeof f.route.GET,'function');
  const response=await f.route.GET(new Request('https://clm.example/api/marketing',{headers:{Authorization:'Bearer valid'}}));
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  const body=await response.json();assert.equal(body.teams[0].name,'Partnership');assert.deepEqual(body.contentItems,[]);
  assert.equal(body.capabilities.meta.status,'not_connected');assert.equal(body.capabilities.render.status,'not_configured');assert.equal(JSON.stringify(body).includes('Bearer'),false);
});
test('Marketing rejects Viewer writes and forged active-role header before RPC',async()=>{
  const f=fixture({roles:['Viewer']});assert.equal(typeof f.route.POST,'function');
  assert.equal((await f.route.POST(request({action:'create_team',name:'Team'},{'X-CLM-Active-Role':'Admin'}))).status,403);assert.equal(f.calls.length,0);
  const staff=fixture();assert.equal((await staff.route.POST(request({action:'create_team',name:'Team'},{'X-CLM-Active-Role':'Admin'}))).status,403);assert.equal(staff.calls.length,0);
});
test('Marketing posts only validated allowlisted payload to transactional JWT RPC',async()=>{
  const f=fixture();assert.equal(typeof f.route.POST,'function');
  const payload={action:'create_campaign',team_id:id,name:'A',kind:'always_on',objective:'',audience:'',message:'',start_date:null,end_date:null};
  assert.equal((await f.route.POST(request(payload))).status,200);
  assert.deepEqual(f.calls,[{name:'marketing_command',args:{p_command:payload}}]);
  for(const bad of [{...payload,creator_id:id},{action:'publishApprovedPost'},'{',payload]) {
    const res=await f.route.POST(request(bad,bad===payload?{Origin:'https://evil.test'}:{}));assert.equal(res.status,bad===payload?403:400);
  }
  assert.equal(f.calls.length,1);
});
test('Marketing stale versions return conflict, schema errors are actionable and unexpected errors are redacted',async()=>{
  const payload={action:'submit_activation',id,expected_version:1};
  for(const [rpcError,status,code] of [[{code:'40001',message:'raw secret'},409,'conflict'],[{code:'42501',message:'raw secret'},403,'forbidden'],[{code:'PGRST202',message:'raw secret'},503,'schema_unavailable'],[{code:'XX000',message:'token=secret'},500,'internal_error']]){
    const f=fixture({rpcError});assert.equal(typeof f.route.POST,'function');
    const res=await f.route.POST(request(payload));assert.equal(res.status,status);const body=await res.json();assert.equal(body.code,code);assert.equal(JSON.stringify(body).includes('secret'),false);
  }
  const f=fixture({readError:{code:'42P01'}});assert.equal((await f.route.GET(new Request('https://clm.example/api/marketing',{headers:{Authorization:'Bearer valid'}}))).status,503);
});
test('Marketing limits actual request bytes and rejects non-JSON without database work',async()=>{
  const f=fixture();assert.equal(typeof f.route.POST,'function');
  assert.equal((await f.route.POST(request('x'.repeat(262145)))).status,413);
  assert.equal((await f.route.POST(request('{}',{'Content-Type':'text/plain'}))).status,415);
  assert.equal(f.calls.length,0);
});
test('Marketing pages beyond Supabase default 1000 rows and never silently truncates calendar',async()=>{
  const f=fixture();
  f.tables.marketing_content_items=Array.from({length:1201},(_,i)=>({id:String(i)}));
  const req=()=>new Request('https://clm.example/api/marketing',{headers:{Authorization:'Bearer valid'}});
  const response=await f.route.GET(req());assert.equal(response.status,200);assert.equal((await response.json()).contentItems.length,1201);
  f.tables.marketing_content_items=Array.from({length:2001},(_,i)=>({id:String(i)}));
  const full=await f.route.GET(req());assert.equal(full.status,503);assert.equal((await full.json()).code,'capacity_limit');
});
test('Marketing honors exact count when a database lowers its Data API row cap',async()=>{
  const f=fixture({maxRows:100});f.tables.marketing_content_items=Array.from({length:401},(_,i)=>({id:String(i)}));
  const res=await f.route.GET(new Request('https://clm.example/api/marketing',{headers:{Authorization:'Bearer valid'}}));
  assert.equal(res.status,200);assert.equal((await res.json()).contentItems.length,401);
});
