import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {routeLoader} from './helpers/load-route.mjs';
const id='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
function fixture() {
  const file=Buffer.alloc(45);Buffer.from([137,80,78,71,13,10,26,10]).copy(file);file.writeUInt32BE(13,8);file.write('IHDR',12);file.writeUInt32BE(1080,16);file.writeUInt32BE(1080,20);file[24]=8;file[25]=2;file.write('IEND',37);
  const hash=createHash('sha256').update(file).digest('hex');
  const slot='2026-11-10T10:00:00.000Z';
  const asset={id,team_id:id,campaign_id:id,mime_type:'image/png',byte_size:file.length,width:1080,height:1080,reported_sha256:hash,storage_path:`${id}/${id}/original.png`,status:'ready',rights:'approved',allowed_channels:['facebook'],valid_until:null,version:3};
  const job={id,team_id:id,campaign_id:id,content_id:id,candidate_id:id,approval_id:id,connection_id:id,status:'published',scheduled_for:slot,created_at:slot};
  const approval={id,team_id:id,content_id:id,approver_id:id,content_version:2,created_at:slot,snapshot:{candidate_id:id,scheduled_for:slot,connection:{id,provider:'facebook'},final_asset_ids:[id],media:[{asset_id:id,asset_version:3,byte_size:file.length,sha256:hash}]}};
  const tables={marketing_assets:asset,marketing_publishing_jobs:job,marketing_approval_snapshots:approval};
  const f={downloads:0,onDownload:()=>{},tables,file};
  const client={from(table){let filters=[];const q={select(){return q;},eq(k,v){filters.push(row=>row[k]===v);return q;},async maybeSingle(){const row=tables[table];return {data:row&&filters.every(fn=>fn(row))?structuredClone(row):null,error:null};}};return q;},storage:{from(){return {async download(){f.downloads++;f.onDownload();return {data:new Blob([file]),error:null};}};}}};
  const load=routeLoader({'@/lib/dashboardSession':{getDashboardRequestIdentity:async request=>{
    if(!request.headers.has('authorization'))throw Object.assign(Error('private'),{status:401});return {profile:{id,roles:['Viewer']},client};
  }}});
  try{f.route=load('app/api/marketing/calendar/media/route.ts');}catch(error){if(error.code!=='ENOENT')throw error;f.route={};}
  f.request=(query=`job_id=${id}&asset_id=${id}`)=>new Request('https://clm.test/api/marketing/calendar/media?'+query,{headers:{Authorization:'Bearer fixture'}});
  return f;
}
test('Calendar preview is private, checks its sealed bytes, and accepts read-only users',async()=>{
  const f=fixture();assert.equal(typeof f.route.GET,'function');
  assert.equal((await f.route.GET(new Request('https://clm.test/api/marketing/calendar/media'))).status,401);
  const before=Date.now();const response=await f.route.GET(f.request());assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('content-type'),'image/png');
  assert.ok(Date.parse(response.headers.get('x-marketing-preview-until'))<=before+31000);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),f.file);
});
test('Calendar preview rejects unbound images, malformed queries, stale versions and revoked rights before download',async()=>{
  const f=fixture();assert.equal(typeof f.route.GET,'function');
  for(const query of [`job_id=${id}&asset_id=${other}`,`job_id=${id}&asset_id=${id}&path=private`,`job_id=${id}&asset_id=${id}&asset_id=${id}`])assert.ok((await f.route.GET(f.request(query))).status>=400);
  const changes=[x=>x.marketing_publishing_jobs.team_id=other,x=>x.marketing_publishing_jobs.status='cancelled',x=>x.marketing_approval_snapshots.snapshot.connection.id=other,x=>x.marketing_assets.version++,x=>x.marketing_assets.rights='revoked',x=>x.marketing_assets.valid_until='2000-01-01T00:00:00Z',x=>x.marketing_assets.allowed_channels=[],x=>x.marketing_assets.campaign_id=other];
  for(const change of changes){const bad=fixture();change(bad.tables);assert.ok((await bad.route.GET(bad.request())).status>=400);assert.equal(bad.downloads,0);}
  assert.equal(f.downloads,0);
});
test('Calendar preview rechecks scope and rights after download and never serves mismatched bytes',async()=>{
  for(const change of [f=>f.tables.marketing_assets.rights='revoked',f=>delete f.tables.marketing_publishing_jobs,f=>f.tables.marketing_publishing_jobs.status='cancelled',f=>f.file[29]=17,f=>f.tables.marketing_approval_snapshots.snapshot.media[0].sha256='b'.repeat(64)]){
    const f=fixture();assert.equal(typeof f.route.GET,'function');f.onDownload=()=>change(f);
    assert.ok((await f.route.GET(f.request())).status>=400);
    assert.equal(f.downloads,1);
  }
  const f=fixture();f.tables.marketing_assets.valid_until=new Date(Date.now()+5000).toISOString();
  const response=await f.route.GET(f.request());assert.equal(response.status,200);assert.equal(response.headers.get('x-marketing-preview-until'),f.tables.marketing_assets.valid_until);
});
