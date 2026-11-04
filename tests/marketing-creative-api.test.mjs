import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {routeLoader} from './helpers/load-route.mjs';
const id='11111111-1111-4111-8111-111111111111';
const png=()=>{const b=Buffer.alloc(45);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(1080,16);b.writeUInt32BE(1080,20);b[24]=8;b[25]=2;b.write('IEND',37);return b;};
function fixture({roles=['PR Representative'],assetPatch={},rpcError=null,storageError=null}={}){
 const calls=[],file=png(),asset={id,team_id:id,campaign_id:null,title:'Ảnh',filename:'anh.png',mime_type:'image/png',byte_size:file.length,width:1080,height:1080,reported_sha256:createHash('sha256').update(file).digest('hex'),storage_path:`${id}/${id}/original.png`,status:'pending_upload',rights:'needs_review',valid_until:null,version:1,...assetPatch};
 const client={from(table){let match=null;const q={select(){return q;},eq(k,v){match=[k,v];return q;},order(){return q;},range(){return q;},maybeSingle(){calls.push(['read',table,match]);return Promise.resolve({data:asset,error:null});},then(resolve){return Promise.resolve({data:[],count:0,error:null}).then(resolve);}};return q;},async rpc(name,args){calls.push(['rpc',name,args.p_command]);return {data:asset,error:rpcError};},storage:{from(bucket){return {async upload(path,bytes,options){calls.push(['upload',bucket,path,bytes.length,options]);return {data:{path},error:storageError};},async download(path){calls.push(['download',bucket,path]);return {data:new Blob([file]),error:storageError};}};}}};
 const load=routeLoader({'@/lib/dashboardSession':{getDashboardRequestIdentity:async request=>{if(request.headers.get('authorization')!=='Bearer valid')throw Object.assign(new Error('private'),{status:401});return {profile:{id,roles,status:'active'},client};}}});
 const route={};for(const name of ['creative','creative/upload','creative/file'])try{route[name]=load(`app/api/marketing/${name}/route.ts`);}catch(e){if(e.code!=='ENOENT')throw e;}
 return {route,calls,asset,file};
}
const req=(path='/creative',body,method=body===undefined?'GET':'POST',extra={})=>new Request('https://clm.example/api/marketing'+path,{method,headers:{Authorization:'Bearer valid','Content-Type':'application/json',...extra},...(body===undefined?{}:{body:typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body)})});
test('Creative runtime requires active JWT and rejects Viewer mutations or forged selected role',async()=>{
 const f=fixture();assert.equal(typeof f.route.creative?.GET,'function');assert.equal((await f.route.creative.GET(new Request('https://clm.example/api/marketing/creative'))).status,401);assert.equal(f.calls.length,0);
 const v=fixture({roles:['Viewer']});assert.equal((await v.route.creative.POST(req('/creative',{action:'prepare_export',id,expected_version:1},'POST',{'X-CLM-Active-Role':'Admin'}))).status,403);assert.equal(v.calls.length,0);
});
test('Creative GET reads RLS entities, uses no-store and does not claim Drive or AI connected',async()=>{
 const f=fixture();assert.equal(typeof f.route.creative?.GET,'function');const r=await f.route.creative.GET(req());assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);const data=await r.json();assert.deepEqual(data.assets,[]);assert.equal(data.capabilities.drive,'not_connected');assert.equal(data.capabilities.ai_design,'not_configured');
});
test('Creative POST allows only normalized RPC command and manager asset review',async()=>{
 const f=fixture();assert.equal(typeof f.route.creative?.POST,'function');assert.equal((await f.route.creative.POST(req('/creative',{action:'complete_asset',id,expected_version:1}))).status,200);assert.deepEqual(f.calls[0],['rpc','marketing_creative_command',{action:'complete_asset',id,expected_version:1}]);
 const review={action:'review_asset',id,expected_version:1,rights:'approved',reason:'Đã đối chiếu',allowed_channels:['facebook'],valid_until:null};assert.equal((await f.route.creative.POST(req('/creative',review))).status,403);assert.equal((await fixture({roles:['PR Leader']}).route.creative.POST(req('/creative',review))).status,200);
 for(const [body,status]of [[{action:'publish'},400],['{',400],['x'.repeat(262145),413]])assert.equal((await f.route.creative.POST(req('/creative',body))).status,status);
 assert.equal((await f.route.creative.POST(req('/creative',{action:'complete_asset',id,expected_version:1},'POST',{Origin:'https://evil.test'}))).status,403);
});
test('Creative errors hide storage/database detail and surface optimistic conflicts',async()=>{
 for(const [code,status]of [['42501',403],['40001',409],['PGRST202',503],['XX000',500]]){const f=fixture({rpcError:{code,message:'SECRET'}});assert.equal(typeof f.route.creative?.POST,'function');const r=await f.route.creative.POST(req('/creative',{action:'complete_asset',id,expected_version:1}));assert.equal(r.status,status);assert.equal((await r.text()).includes('SECRET'),false);}
});
test('Raw upload validates scope reservation and bytes before private immutable user-JWT upload',async()=>{
 const f=fixture();assert.equal(typeof f.route['creative/upload']?.POST,'function');const r=await f.route['creative/upload'].POST(req('/creative/upload?reservation='+id,f.file,'POST',{'Content-Type':'image/png'}));assert.equal(r.status,200);const uploaded=f.calls.find(c=>c[0]==='upload');assert.deepEqual(uploaded,['upload','marketing-originals',f.asset.storage_path,f.file.length,{contentType:'image/png',upsert:false,cacheControl:'0'}]);assert.equal(f.calls.at(-1)[1],'marketing_creative_command');
});
test('Raw upload cannot forge immutable digest/dimensions or send SVG and oversize stream',async()=>{
 for(const patch of [{reported_sha256:'b'.repeat(64)},{width:500},{byte_size:46},{rights:'revoked'}]){const f=fixture({assetPatch:patch});assert.equal(typeof f.route['creative/upload']?.POST,'function');assert.ok((await f.route['creative/upload'].POST(req('/creative/upload?reservation='+id,f.file,'POST',{'Content-Type':'image/png'}))).status>=400);assert.ok(!f.calls.some(c=>c[0]==='upload'));}
 const f=fixture();for(const [body,headers,status] of [[Buffer.from('<svg/>'),{'Content-Type':'image/svg+xml'},415],[f.file,{'Content-Type':'image/png','Content-Length':'8388609'},413]])assert.equal((await f.route['creative/upload'].POST(req('/creative/upload?reservation='+id,body,'POST',headers))).status,status);
 const v=fixture({roles:['Viewer']});assert.equal((await v.route['creative/upload'].POST(req('/creative/upload?reservation='+id,v.file,'POST',{'Content-Type':'image/png'}))).status,403);
});
test('Private file endpoint never redirects or caches and rechecks revocation and actual stored digest',async()=>{
 const f=fixture({assetPatch:{status:'ready'}});assert.equal(typeof f.route['creative/file']?.GET,'function');const r=await f.route['creative/file'].GET(req('/creative/file?id='+id));assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal((await r.arrayBuffer()).byteLength,f.file.length);
 for(const patch of [{rights:'revoked'},{valid_until:'2000-01-01T00:00:00Z'},{reported_sha256:'b'.repeat(64)},{status:'pending_upload'}]){const bad=fixture({assetPatch:{status:'ready',...patch}});const response=await bad.route['creative/file'].GET(req('/creative/file?id='+id));assert.ok(response.status>=400);}
});
test('Revoked and expired private file denial is resource-specific and never downloads bytes',async()=>{for(const patch of [{rights:'revoked'},{valid_until:'2000-01-01T00:00:00Z'}]){const f=fixture({assetPatch:{status:'ready',...patch}});const response=await f.route['creative/file'].GET(req('/creative/file?id='+id));assert.equal(response.status,403);assert.equal((await response.json()).code,'asset_unavailable');assert.equal(f.calls.some(c=>c[0]==='download'),false);}});
