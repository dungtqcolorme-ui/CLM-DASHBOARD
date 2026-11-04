import test from 'node:test';
import assert from 'node:assert/strict';
import {routeLoader} from './helpers/load-route.mjs';
let d={};try{d=routeLoader({})('lib/marketing/knowledge-domain.ts');}catch(e){if(e.code!=='ENOENT')throw e;}
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const source={action:'create_source',team_id:id,title:'Nguồn sinh viên',kind:'member_brief',url:null,excerpt:'Brief do thành viên cung cấp.',author:null,published_at:null};
test('Knowledge commands are bounded, exact and cannot forge source trust/actor or invoke tools',()=>{
 assert.equal(typeof d.parseKnowledgeCommand,'function');assert.deepEqual(d.parseKnowledgeCommand(source),source);
 for(const bad of [{...source,status:'approved'},{...source,reviewer_id:id},{...source,creator_id:id},{...source,excerpt:'x'.repeat(8001)},{...source,published_at:'2026-02-30'},{action:'publish'},{action:'call_tool',tool:'fetch'},null,[]]) assert.throws(()=>d.parseKnowledgeCommand(bad),e=>e.status===400);
 assert.throws(()=>d.parseKnowledgeCommand({action:'review_source',id,expected_version:0,decision:'approve',reason:'Đã đối chiếu'}));
});
test('Source references cannot carry credentials, local/IP URLs, secret query values or non-https schemes',()=>{
 assert.equal(typeof d.parseKnowledgeCommand,'function');
 for(const url of ['http://example.org','https://localhost/path','https://127.0.0.1','https://169.254.169.254','https://[::1]','https://user:pass@example.org','https://foo.internal','https://example.org:8443','file:///tmp/private','https://example.org?access_token=private','https://example.org?token=abc']) assert.throws(()=>d.parseKnowledgeCommand({...source,kind:'public_reference',url}),undefined,url);
 assert.equal(d.parseKnowledgeCommand({...source,kind:'public_reference',url:'https://example.org/guide#section'}).url,'https://example.org/guide');
 assert.throws(()=>d.parseKnowledgeCommand({...source,kind:'official_website',url:null}));
 assert.throws(()=>d.parseKnowledgeCommand({...source,kind:'public_reference',url:'https://example.org/'+ 'é'.repeat(600)}));
});
test('Facts preserve classification and explicit expiry instead of accepting caller verification',()=>{
 assert.equal(typeof d.parseKnowledgeCommand,'function');
 const fact={action:'create_fact',source_id:id,claim:'Dữ kiện cần kiểm chứng',claim_type:'hypothesis',category:'offer',valid_until:'2026-11-05T00:00:00+07:00'};
 assert.equal(d.parseKnowledgeCommand(fact).valid_until,'2026-11-04T17:00:00.000Z');
 assert.throws(()=>d.parseKnowledgeCommand({...fact,status:'verified'}));assert.throws(()=>d.parseKnowledgeCommand({...fact,valid_until:'2026-11-05T00:00'}));
 assert.throws(()=>d.parseKnowledgeCommand({...fact,claim_type:'official_fact'}));
 assert.throws(()=>d.parseKnowledgeCommand({...fact,valid_until:'1000-01-01T00:00:00+14:00'}));
 assert.throws(()=>d.parseKnowledgeCommand({...fact,valid_until:'9999-12-31T23:59:59-12:00'}));
});
test('Research mode cannot be widened by hidden network/tool flags or client-provided results',()=>{
 assert.equal(typeof d.parseKnowledgeCommand,'function');
 const run={action:'run_research',campaign_id:id,mode:'internal_only',query:'sinh viên'};
 assert.deepEqual(d.parseKnowledgeCommand(run),run);
 for(const extra of [{allow_web:true},{evidence:[id]},{provider:'openai'},{status:'completed'},{tools:['publish']}])assert.throws(()=>d.parseKnowledgeCommand({...run,...extra}));
});
test('Idea drafts have explicit evidence, cannot masquerade as AI/selected and selection cannot publish',()=>{
 assert.equal(typeof d.parseKnowledgeCommand,'function');
 const idea={action:'create_idea',campaign_id:id,title:'Ý tưởng',objective:'Chia sẻ',hook:'Góc mở',caption:'Nháp',content_line:'Sharing',rationale:'Từ brief',planned_for:null,fact_ids:[id]};
 assert.deepEqual(d.parseKnowledgeCommand(idea),idea);
 for(const extra of [{origin:'ai'},{status:'selected'},{content_id:other},{publishing_status:'scheduled'},{fact_ids:[id,id]}]) assert.throws(()=>d.parseKnowledgeCommand({...idea,...extra}));
 assert.throws(()=>d.parseKnowledgeCommand({action:'select_idea',id,expected_version:1,publish:true}));
});
test('DNA child scopes cannot introduce hard rules or spoof official approval',()=>{
 assert.equal(typeof d.parseKnowledgeCommand,'function');
 const proposed={voice:'Rõ ràng',hooks:'Gần gũi',cta:'Thử thực hành',visual_notes:'Dùng asset chính thức',hard_rules:[]};
 const dna={action:'propose_dna',scope:'team',team_id:id,content_id:null,base_version:0,proposed,reason:'Đề xuất ban đầu'};
 assert.deepEqual(d.parseKnowledgeCommand(dna),dna);
 assert.throws(()=>d.parseKnowledgeCommand({...dna,proposed:{...proposed,hard_rules:['Override master']}}));
 assert.throws(()=>d.parseKnowledgeCommand({...dna,scope:'master'}));
 assert.throws(()=>d.parseKnowledgeCommand({...dna,approved_by:id}));
 assert.throws(()=>d.parseKnowledgeCommand({action:'apply_dna',id,expected_version:1,confirmed:false}));
 assert.deepEqual(d.parseKnowledgeCommand({action:'apply_dna',id,expected_version:1,confirmed:true}),{action:'apply_dna',id,expected_version:1,confirmed:true});
});
test('Evidence freshness checks exact versions, expiry, classification and team binding',()=>{
 assert.equal(typeof d.isEvidenceCurrent,'function');
 const ref={source_id:id,source_version:1,fact_id:other,fact_version:2};
 const s={id,team_id:'team',version:1,status:'approved'};
 const f={id:other,source_id:id,team_id:'team',version:2,status:'verified',claim_type:'fact',category:'general',valid_until:null};
 const now=new Date('2026-11-04T00:00:00Z');assert.equal(d.isEvidenceCurrent(ref,[f],[s],now),true);
 for(const changed of [{...s,status:'revoked'},{...s,version:2},{...s,team_id:'other-team'}])assert.equal(d.isEvidenceCurrent(ref,[f],[changed],now),false);
 for(const changed of [{...f,status:'disputed'},{...f,claim_type:'hypothesis'},{...f,version:3},{...f,valid_until:'2026-11-03T23:59:59Z'},{...f,category:'offer'}])assert.equal(d.isEvidenceCurrent(ref,[changed],[s],now),false);
});
test('Effective DNA inherits only creative fields and retains immutable Master hard rules',()=>{
 assert.equal(typeof d.effectiveDna,'function');
 const master={scope:'master',payload:{voice:'Master',hooks:'Master hook',cta:'Master CTA',visual_notes:'Logo đúng tỷ lệ',hard_rules:['Không méo logo']}};
 const team={scope:'team',team_id:id,payload:{voice:'Team',hooks:'',cta:'Team CTA',visual_notes:'',hard_rules:[]}};
 const post={scope:'post',team_id:id,content_id:other,payload:{voice:'Post',hooks:'Post hook',cta:'',visual_notes:'',hard_rules:['Invalid child rule']}};
 const effective=d.effectiveDna([master,team,post],id,other);assert.equal(effective.voice,'Post');assert.equal(effective.cta,'Team CTA');assert.deepEqual(effective.hard_rules,['Không méo logo']);effective.hard_rules.push('Local');assert.equal(master.payload.hard_rules.length,1);
});
test('Duplicate warnings match normalized exact title/caption and never claim semantic detection',()=>{
 assert.equal(typeof d.exactDuplicateIdeas,'function');
 const hits=d.exactDuplicateIdeas({title:'  Kỹ NĂNG  ',caption:'Khác'},[{id,title:'Kỹ năng',caption:'Cũ'}],[{id:other,title:'Nội dung khác',caption:'Khác'}]);
 assert.equal(hits.length,2);assert.deepEqual(new Set(hits.map(h=>h.kind)),new Set(['idea','content']));
 assert.equal(d.exactDuplicateIdeas({title:'Thiết kế cho sinh viên',caption:''},[{id,title:'Sáng tạo dành cho sinh viên',caption:''}],[]).length,0);
});
