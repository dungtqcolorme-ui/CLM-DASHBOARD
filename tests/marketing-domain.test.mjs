import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLoader } from './helpers/load-route.mjs';
const load = routeLoader({});
let domain = {};
let navigation = {};
try { domain = load('lib/marketing/domain.ts'); navigation = load('lib/marketing/navigation.ts'); } catch (error) { if(error.code !== 'ENOENT') throw error; }
const id='11111111-1111-4111-8111-111111111111';
const campaign={action:'create_campaign',team_id:id,name:'Chào Tân',kind:'seasonal',objective:'Kết nối sinh viên',audience:'Sinh viên',message:'Cùng sáng tạo',start_date:'2026-11-04',end_date:'2026-12-01'};
test('Marketing validates bounded allowlisted commands before database access',()=>{
  assert.equal(typeof domain.parseMarketingCommand,'function');
  assert.deepEqual(domain.parseMarketingCommand(campaign),campaign);
  for(const bad of [{...campaign,creator_id:id},{...campaign,status:'active'},{...campaign,name:' '},{...campaign,team_id:'x'},{...campaign,start_date:'2026-02-30'},{...campaign,end_date:'2025-01-01'},null,[],{action:'publishApprovedPost'},{action:'approve_own'}]){
    assert.throws(()=>domain.parseMarketingCommand(bad),error=>error.status===400);
  }
});
test('Content Mix rejects nonfinite/negative/partial and accepts exactly four lines totaling 100',()=>{
  assert.equal(typeof domain.parseMarketingCommand,'function');
  const plan={action:'update_plan',id,expected_version:1,content_mix:{ColorMAP:40,Sharing:30,Meme:20,InsideME:10},plan:'Kế hoạch',kpi_draft:[{name:'Bài viết',target:10,unit:'bài'}]};
  assert.deepEqual(domain.parseMarketingCommand(plan),plan);
  for(const content_mix of [{ColorMAP:40,Sharing:30,Meme:20,InsideME:9},{ColorMAP:101,Sharing:-1,Meme:0,InsideME:0},{ColorMAP:100},{ColorMAP:NaN,Sharing:0,Meme:0,InsideME:0},{...plan.content_mix,Other:0}]) assert.throws(()=>domain.parseMarketingCommand({...plan,content_mix}));
  assert.throws(()=>domain.parseMarketingCommand({...plan,expected_version:0}));
  assert.throws(()=>domain.parseMarketingCommand({...plan,kpi_draft:[{name:'Bài',target:-1,unit:'bài'}]}));
});
test('Content commands cannot forge creator, approval, channel or publishing state',()=>{
  assert.equal(typeof domain.parseMarketingCommand,'function');
  const content={action:'create_content',campaign_id:id,title:'Một ý tưởng',caption:'Nội dung thật',content_line:'Sharing',assignee_id:null,production_status:'writing',production_due_at:null,review_due_at:null,proposed_publish_at:'2026-11-04T09:00:00.000Z'};
  assert.deepEqual(domain.parseMarketingCommand(content),content);
  for(const extra of [{creator_id:id},{publishing_status:'approved'},{target_page_id:'103245086061688'},{approved_by:id}]) assert.throws(()=>domain.parseMarketingCommand({...content,...extra}));
  assert.throws(()=>domain.parseMarketingCommand({...content,proposed_publish_at:'2026-11-04T16:00'}));
  assert.throws(()=>domain.parseMarketingCommand({...content,production_status:'published'}));
});
test('Review authorization uses immutable creator and all verified roles, never selected role',()=>{
  assert.equal(typeof domain.canReviewContent,'function');
  const creator={id,status:'active',roles:['Admin','PR Leader']};
  assert.equal(domain.canReviewContent(creator,{creator_id:id,team_id:'a'},['a']),false);
  assert.equal(domain.canReviewContent({...creator,id:'other'},{creator_id:id,team_id:'b'},[]),true);
  assert.equal(domain.canReviewContent({id:'leader',status:'active',roles:['PR Leader']},{creator_id:id,team_id:'b'},['a']),false);
  assert.equal(domain.canReviewContent({id:'leader',status:'locked',roles:['PR Leader']},{creator_id:id,team_id:'a'},['a']),false);
  assert.equal(domain.canReviewContent({id:'staff',status:'active',roles:['PR Representative']},{creator_id:id,team_id:'a'},['a']),false);
});
test('Calendar conversion uses Vietnam time regardless of host timezone and rejects impossible dates',()=>{
  assert.equal(typeof domain.vietnamLocalToUtc,'function');
  assert.equal(domain.vietnamLocalToUtc('2026-11-04T00:30'),'2026-11-03T17:30:00.000Z');
  assert.equal(domain.utcToVietnamLocal('2026-11-03T17:30:00.000Z'),'2026-11-04T00:30');
  assert.equal(domain.vietnamLocalToUtc(''),null);
  assert.throws(()=>domain.vietnamLocalToUtc('2026-02-30T12:00'));
});
test('Navigation has exactly eight children and only accepts local Marketing return paths',()=>{
  assert.equal(navigation.MARKETING_NAV?.length,8);
  assert.equal(navigation.isMarketingPath('/marketing/studio?content='+id),true);
  for(const path of ['//evil.test','/marketing-evil','https://evil.test/marketing','/marketing/../api/admin','/marketing/%2e%2e/api','/marketing\\evil','/marketing?x=\nfoo']) assert.equal(navigation.isMarketingPath(path),false,path);
  assert.equal(navigation.isMarketingActive('/marketing/campaigns/'+id,'/marketing/campaigns'),true);
  assert.equal(navigation.isMarketingActive('/marketing/campaigns','/marketing'),false);
});
