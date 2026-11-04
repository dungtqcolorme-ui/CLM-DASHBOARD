begin;
create schema knowledge_test;
create function knowledge_test.assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %',label; end if; end $$;
select knowledge_test.assert(to_regprocedure('public.marketing_knowledge_command(jsonb)') is not null,'knowledge mutation RPC exists');

create function knowledge_test.reject(command jsonb,label text,expected_code text default null) returns void language plpgsql as $$ begin
 begin perform public.marketing_knowledge_command(command); exception when others then
 if expected_code is not null and sqlstate<>expected_code then raise exception 'ASSERT %: expected %, got % (%)',label,expected_code,sqlstate,sqlerrm;end if;return;end;
 raise exception 'ASSERT accepted forbidden command: %',label;end $$;
create function knowledge_test.reject_sql(statement text,label text,expected_code text default '42501') returns void language plpgsql as $$ begin
 begin execute statement;exception when others then if sqlstate<>expected_code then raise exception 'ASSERT %: expected %, got % (%)',label,expected_code,sqlstate,sqlerrm;end if;return;end;raise exception 'ASSERT direct SQL accepted: %',label;end $$;
create function knowledge_test.idea_edit(idea_id uuid,ids jsonb) returns jsonb language sql as $$
 select jsonb_build_object('action','update_idea','id',id,'expected_version',version,'title',title,'objective',objective,'hook',hook,'caption',caption,'content_line',content_line,'rationale',rationale,'planned_for',planned_for,'fact_ids',ids) from public.marketing_ideas where id=idea_id;
$$;
grant usage on schema knowledge_test to authenticated;
grant execute on all functions in schema knowledge_test to authenticated;
insert into auth.users(id,email) values
('20000000-0000-4000-8000-000000000001','knowledge-admin@test.invalid'),
('20000000-0000-4000-8000-000000000002','knowledge-leader@test.invalid'),
('20000000-0000-4000-8000-000000000003','knowledge-member@test.invalid'),
('20000000-0000-4000-8000-000000000004','knowledge-viewer@test.invalid'),
('20000000-0000-4000-8000-000000000005','knowledge-outsider@test.invalid');
insert into public.profiles(id,email,status) select id,email,'active' from auth.users;
insert into public.user_roles(user_id,role) values
('20000000-0000-4000-8000-000000000001','Admin'),('20000000-0000-4000-8000-000000000002','PR Leader'),('20000000-0000-4000-8000-000000000003','PR Representative'),('20000000-0000-4000-8000-000000000004','Viewer'),('20000000-0000-4000-8000-000000000005','PR Leader');
select knowledge_test.assert(not has_function_privilege('service_role','public.marketing_knowledge_command(jsonb)','execute'),'service role has no RPC');
select knowledge_test.assert(not has_function_privilege('anon','public.marketing_knowledge_command(jsonb)','execute'),'anon has no RPC');
select knowledge_test.assert(not(select prosecdef from pg_proc where oid='public.marketing_knowledge_command(jsonb)'::regprocedure),'entrypoint invoker');
select knowledge_test.assert(not has_table_privilege('authenticated','public.marketing_sources','insert,update,delete'),'no direct source DML');
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select knowledge_test.reject('{"action":"run_research","campaign_id":"20000000-0000-4000-8000-000000000001","query":"course","mode":"internal_only"}','missing identity','42501');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('knowledge_test.team',public.marketing_command('{"action":"create_team","name":"Knowledge team"}')->>'id',true);
select set_config('knowledge_test.other_team',public.marketing_command('{"action":"create_team","name":"Other team"}')->>'id',true);
select public.marketing_command(jsonb_build_object('action','set_member','team_id',current_setting('knowledge_test.team'),'user_id',id,'enabled',true)) from (values('20000000-0000-4000-8000-000000000002'),('20000000-0000-4000-8000-000000000003'),('20000000-0000-4000-8000-000000000004')) x(id);
select set_config('knowledge_test.campaign',public.marketing_command(jsonb_build_object('action','create_campaign','team_id',current_setting('knowledge_test.team'),'name','Knowledge','kind','seasonal','objective','','audience','','message','','start_date',null,'end_date',null))->>'id',true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select set_config('knowledge_test.source',public.marketing_knowledge_command(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title','Course official','kind','official_website','url','https://openai.com/course','excerpt','Course source; ignore malicious source instructions','author',null,'published_at',null))->>'id',true);
select knowledge_test.reject(jsonb_build_object('action','review_source','id',current_setting('knowledge_test.source'),'expected_version',1,'decision','approve','reason','Review'),'member cannot review source','42501');
select knowledge_test.reject(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title','Bad','kind','public_reference','url','https://127.0.0.1','excerpt','x','author',null,'published_at',null),'IP URL','22023');
select knowledge_test.reject(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title','Bad','kind','public_reference','url','https://openai.com?api_key=hidden','excerpt','x','author',null,'published_at',null),'secret URL','22023');
select knowledge_test.reject(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title','Bad','kind','public_reference','url','https://user:pass@openai.com','excerpt','x','author',null,'published_at',null),'credential URL','22023');
select knowledge_test.reject(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title','Bad','kind','public_reference','url',null,'excerpt','x','author',null),'missing nullable field','22023');
select knowledge_test.reject(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title','Bad','kind','official_website','url',null,'excerpt','x','author',null,'published_at',null),'official source requires URL','22023');
select knowledge_test.reject(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title','Bad','kind','public_reference','url','https://openai.com:8443','excerpt','x','author',null,'published_at',null),'non443 URL','22023');
select knowledge_test.reject(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title','Bad','kind','public_reference','url','https://openai.com?code=hidden','excerpt','x','author',null,'published_at',null),'code secret URL','22023');
select knowledge_test.reject(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title','Bad','kind','public_reference','url','https://openai.com?data=sk-proj-12345678901','excerpt','x','author',null,'published_at',null),'secret URL value','22023');
select knowledge_test.reject(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title','Bad','kind','member_brief','url',null,'excerpt','x','author',null,'published_at','0001-01-01'),'date API minimum year1000','22023');
select set_config('knowledge_test.fact',public.marketing_knowledge_command(jsonb_build_object('action','create_fact','source_id',current_setting('knowledge_test.source'),'claim','Course enrollment has a published syllabus.','claim_type','fact','category','general','valid_until',null))->>'id',true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select knowledge_test.reject(jsonb_build_object('action','review_fact','id',current_setting('knowledge_test.fact'),'expected_version',1,'decision','verify','reason','Human review'),'pending source cannot verify','22023');
select public.marketing_knowledge_command(jsonb_build_object('action','review_source','id',current_setting('knowledge_test.source'),'expected_version',1,'decision','approve','reason','Human reviewed official site'));
select public.marketing_knowledge_command(jsonb_build_object('action','review_fact','id',current_setting('knowledge_test.fact'),'expected_version',1,'decision','verify','reason','Human reviewed claim'));
select set_config('knowledge_test.hypothesis',public.marketing_knowledge_command(jsonb_build_object('action','create_fact','source_id',current_setting('knowledge_test.source'),'claim','Course may be popular','claim_type','hypothesis','category','general','valid_until',null))->>'id',true);
select knowledge_test.reject(jsonb_build_object('action','review_fact','id',current_setting('knowledge_test.hypothesis'),'expected_version',1,'decision','verify','reason','No'),'hypothesis cannot verify','22023');
select set_config('knowledge_test.offer',public.marketing_knowledge_command(jsonb_build_object('action','create_fact','source_id',current_setting('knowledge_test.source'),'claim','Course offer','claim_type','fact','category','offer','valid_until',null))->>'id',true);
select knowledge_test.reject(jsonb_build_object('action','review_fact','id',current_setting('knowledge_test.offer'),'expected_version',1,'decision','verify','reason','No'),'business expiry mandatory','22023');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select set_config('knowledge_test.run',public.marketing_knowledge_command(jsonb_build_object('action','run_research','campaign_id',current_setting('knowledge_test.campaign'),'mode','internal_only','query','course'))->>'id',true);
select knowledge_test.assert((select jsonb_array_length(evidence)=1 and not(evidence->0 ? 'claim') from public.marketing_research_runs where id=current_setting('knowledge_test.run')::uuid),'research only exact valid refs, no raw cache');
select knowledge_test.assert(public.marketing_knowledge_command(jsonb_build_object('action','run_research','campaign_id',current_setting('knowledge_test.campaign'),'mode','auto','query','course'))->>'strategy'='internal_fallback','auto truthful fallback');
select knowledge_test.assert(public.marketing_knowledge_command(jsonb_build_object('action','run_research','campaign_id',current_setting('knowledge_test.campaign'),'mode','deep_research','query','course'))->>'status'='not_configured','deep no provider');
select set_config('knowledge_test.idea',(public.marketing_knowledge_command(jsonb_build_object('action','generate_internal_ideas','run_id',current_setting('knowledge_test.run'),'content_line','Sharing'))->0->>'id'),true);
select knowledge_test.assert((select count(*)=0 from public.marketing_content_items),'generation creates no content');
select knowledge_test.assert((public.marketing_knowledge_command(jsonb_build_object('action','generate_internal_ideas','run_id',current_setting('knowledge_test.run'),'content_line','Sharing'))->0->>'id')=current_setting('knowledge_test.idea'),'repeat generation deduplicates');
select knowledge_test.assert((select origin='rule_based' and caption like '%https://openai.com/course%' from public.marketing_ideas where id=current_setting('knowledge_test.idea')::uuid),'honest origin and URL citation');
-- Automatic drafts keep their original exact versioned evidence when edited.
select set_config('knowledge_test.bound_idea',(public.marketing_knowledge_command(jsonb_build_object('action','generate_internal_ideas','run_id',current_setting('knowledge_test.run'),'content_line','Meme'))->0->>'id'),true);
select set_config('knowledge_test.alternative_source',public.marketing_knowledge_command(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title','Independent verified source','kind','member_brief','url',null,'excerpt','Independent brief','author',null,'published_at',null))->>'id',true);
select set_config('knowledge_test.alternative_fact',public.marketing_knowledge_command(jsonb_build_object('action','create_fact','source_id',current_setting('knowledge_test.alternative_source'),'claim','Independent alternative evidence','claim_type','fact','category','general','valid_until',null))->>'id',true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select public.marketing_knowledge_command(jsonb_build_object('action','review_source','id',current_setting('knowledge_test.alternative_source'),'expected_version',1,'decision','approve','reason','Human reviewed'));
select public.marketing_knowledge_command(jsonb_build_object('action','review_fact','id',current_setting('knowledge_test.alternative_fact'),'expected_version',1,'decision','verify','reason','Human reviewed'));
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select knowledge_test.reject(knowledge_test.idea_edit(current_setting('knowledge_test.bound_idea')::uuid,'[]'::jsonb),'rule based evidence cannot be dropped','22023');
select knowledge_test.reject(knowledge_test.idea_edit(current_setting('knowledge_test.bound_idea')::uuid,jsonb_build_array(current_setting('knowledge_test.alternative_fact'))),'rule based evidence cannot be swapped','22023');
select public.marketing_knowledge_command(knowledge_test.idea_edit(current_setting('knowledge_test.bound_idea')::uuid,jsonb_build_array(current_setting('knowledge_test.fact'))));
select knowledge_test.assert((select version=2 and evidence->0->>'fact_id'=current_setting('knowledge_test.fact') and origin='rule_based' from public.marketing_ideas where id=current_setting('knowledge_test.bound_idea')::uuid),'valid edit preserves original evidence and origin');
select set_config('knowledge_test.content',public.marketing_knowledge_command(jsonb_build_object('action','select_idea','id',current_setting('knowledge_test.idea'),'expected_version',1))->>'content_id',true);
select knowledge_test.assert(public.marketing_knowledge_command(jsonb_build_object('action','select_idea','id',current_setting('knowledge_test.idea'),'expected_version',1))->>'content_id'=current_setting('knowledge_test.content'),'selection retry initial version idempotent');
select knowledge_test.assert((select count(*)=1 from public.marketing_content_items),'only one ordinary draft');
select knowledge_test.assert((select publishing_status='draft' and production_status='not_started' and proposed_publish_at is null from public.marketing_content_items where id=current_setting('knowledge_test.content')::uuid),'selection never schedules');
select knowledge_test.assert((select count(*)=1 from public.marketing_revisions where entity_id=current_setting('knowledge_test.content')::uuid),'selection creates phase1 revision');
select set_config('knowledge_test.manual',public.marketing_knowledge_command(jsonb_build_object('action','create_idea','campaign_id',current_setting('knowledge_test.campaign'),'title','Manual','objective','','hook','','caption','Human draft','content_line','Meme','rationale','','planned_for',null,'fact_ids',jsonb_build_array(current_setting('knowledge_test.fact'))))->>'id',true);
select knowledge_test.reject(jsonb_build_object('action','update_idea','id',current_setting('knowledge_test.manual'),'expected_version',2,'title','Manual','objective','','hook','','caption','','content_line','Meme','rationale','','planned_for',null,'fact_ids','[]'::jsonb),'stale idea version','40001');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select public.marketing_knowledge_command(jsonb_build_object('action','review_source','id',current_setting('knowledge_test.source'),'expected_version',2,'decision','revoke','reason','Source withdrawn'));
select knowledge_test.reject(jsonb_build_object('action','generate_internal_ideas','run_id',current_setting('knowledge_test.run'),'content_line','Meme'),'revoked run cannot generate','22023');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select knowledge_test.reject(knowledge_test.idea_edit(current_setting('knowledge_test.bound_idea')::uuid,'[]'::jsonb),'revoked cached caption cannot launder via empty refs','22023');
select knowledge_test.reject(knowledge_test.idea_edit(current_setting('knowledge_test.bound_idea')::uuid,jsonb_build_array(current_setting('knowledge_test.alternative_fact'))),'revoked cached caption cannot launder via valid replacement','22023');
select knowledge_test.reject(knowledge_test.idea_edit(current_setting('knowledge_test.bound_idea')::uuid,jsonb_build_array(current_setting('knowledge_test.fact'))),'revoked original refs cannot be refreshed by edit','22023');
select knowledge_test.assert((select version=2 and evidence->0->>'fact_id'=current_setting('knowledge_test.fact') from public.marketing_ideas where id=current_setting('knowledge_test.bound_idea')::uuid),'failed laundering leaves evidence immutable');
select knowledge_test.reject(jsonb_build_object('action','select_idea','id',current_setting('knowledge_test.bound_idea'),'expected_version',2),'cached automatic draft remains blocked after laundering attempts','22023');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);

select knowledge_test.reject(jsonb_build_object('action','select_idea','id',current_setting('knowledge_test.manual'),'expected_version',1),'revoked evidence cannot select','22023');
select knowledge_test.assert(jsonb_array_length(public.marketing_knowledge_command(jsonb_build_object('action','run_research','campaign_id',current_setting('knowledge_test.campaign'),'mode','internal_only','query','course'))->'evidence')=0,'revoked facts absent from new research');
select set_config('knowledge_test.payload','{"voice":"Clear","hooks":"Ask","cta":"Read","visual_notes":"Simple","hard_rules":[]}',true);
select set_config('knowledge_test.proposal',public.marketing_knowledge_command(jsonb_build_object('action','propose_dna','scope','team','team_id',current_setting('knowledge_test.team'),'content_id',null,'base_version',0,'proposed',current_setting('knowledge_test.payload')::jsonb,'reason','Human proposal'))->>'id',true);
select knowledge_test.assert((select count(*)=0 from public.marketing_dna_profiles),'proposal never auto applies');
select knowledge_test.reject(jsonb_build_object('action','apply_dna','id',current_setting('knowledge_test.proposal'),'expected_version',1,'confirmed',false),'explicit diff confirmation','22023');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select knowledge_test.reject(jsonb_build_object('action','apply_dna','id',current_setting('knowledge_test.proposal'),'expected_version',1,'confirmed',true),'member cannot apply team','42501');
select knowledge_test.reject(jsonb_build_object('action','propose_dna','scope','team','team_id',current_setting('knowledge_test.team'),'content_id',null,'base_version',0,'proposed',jsonb_set(current_setting('knowledge_test.payload')::jsonb,'{hard_rules}','["override"]'),'reason','Bad'),'child cannot override hard rules','22023');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select public.marketing_knowledge_command(jsonb_build_object('action','apply_dna','id',current_setting('knowledge_test.proposal'),'expected_version',1,'confirmed',true));
select knowledge_test.assert((select count(*)=1 from public.marketing_dna_versions),'apply immutable version');
select knowledge_test.reject(jsonb_build_object('action','propose_dna','scope','team','team_id',current_setting('knowledge_test.team'),'content_id',null,'base_version',0,'proposed',current_setting('knowledge_test.payload')::jsonb,'reason','Stale'),'stale DNA base','40001');
select set_config('knowledge_test.proposal2',public.marketing_knowledge_command(jsonb_build_object('action','propose_dna','scope','team','team_id',current_setting('knowledge_test.team'),'content_id',null,'base_version',1,'proposed',current_setting('knowledge_test.payload')::jsonb,'reason','Second'))->>'id',true);
select knowledge_test.assert((select previous=proposed and base_version=1 from public.marketing_dna_proposals where id=current_setting('knowledge_test.proposal2')::uuid),'previous snapshot comes from DB');
select public.marketing_knowledge_command(jsonb_build_object('action','reject_dna','id',current_setting('knowledge_test.proposal2'),'expected_version',1,'reason','Human reject'));
-- Post writers may propose and explicitly apply post DNA, but cannot bind another team.
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select set_config('knowledge_test.post',public.marketing_knowledge_command(jsonb_build_object('action','propose_dna','scope','post','team_id',current_setting('knowledge_test.team'),'content_id',current_setting('knowledge_test.content'),'base_version',0,'proposed',current_setting('knowledge_test.payload')::jsonb,'reason','Post style'))->>'id',true);
select public.marketing_knowledge_command(jsonb_build_object('action','apply_dna','id',current_setting('knowledge_test.post'),'expected_version',1,'confirmed',true));
select knowledge_test.reject(jsonb_build_object('action','propose_dna','scope','post','team_id',current_setting('knowledge_test.other_team'),'content_id',current_setting('knowledge_test.content'),'base_version',0,'proposed',current_setting('knowledge_test.payload')::jsonb,'reason','Wrong post'),'cross team post binding','42501');
-- Preserve large UTF-16 inputs and reject their first invalid code unit.
select set_config('knowledge_test.source_max',public.marketing_knowledge_command(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title',repeat('😀',90),'kind','member_brief','url',null,'excerpt',repeat('😀',4000),'author',repeat('😀',100),'published_at','2026-11-04'))->>'id',true);
select knowledge_test.reject(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title',repeat('😀',90)||'x','kind','member_brief','url',null,'excerpt','x','author',null,'published_at',null),'UTF16 source title max180','22023');
select knowledge_test.reject(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title','x','kind','member_brief','url',null,'excerpt',repeat('😀',4000)||'x','author',null,'published_at',null),'UTF16 excerpt max8000','22023');
select knowledge_test.reject(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title','x','kind','member_brief','url',null,'excerpt','x','author',null,'published_at','2026-02-30'),'invalid date','22023');
select knowledge_test.reject(jsonb_build_object('action','create_fact','source_id',current_setting('knowledge_test.source_max'),'claim','x','claim_type','fact','category','general','valid_until','2026-11-04T16:00'),'timestamp requires timezone','22023');
select knowledge_test.reject(jsonb_build_object('action','create_fact','source_id',current_setting('knowledge_test.source_max'),'claim','x','claim_type','fact','category','general','valid_until','2026-11-04T24:00:00Z'),'timestamp cannot normalize 24h','22023');
select knowledge_test.reject(jsonb_build_object('action','run_research','campaign_id',current_setting('knowledge_test.campaign'),'mode','auto','query',repeat('x',2001)),'query max2000','22023');
select knowledge_test.reject(jsonb_build_object('action','run_research','campaign_id',current_setting('knowledge_test.campaign'),'mode','auto','query','x','unknown',true),'unknown field','22023');
select set_config('knowledge_test.idea_max',public.marketing_knowledge_command(jsonb_build_object('action','create_idea','campaign_id',current_setting('knowledge_test.campaign'),'title',repeat('😀',90),'objective',repeat('😀',2500),'hook',repeat('😀',1000),'caption',repeat('😀',6000),'content_line','Meme','rationale',repeat('😀',1000),'planned_for','2030-11-04T18:00:00+07:00','fact_ids','[]'::jsonb))->>'id',true);
select public.marketing_knowledge_command(jsonb_build_object('action','update_idea','id',current_setting('knowledge_test.idea_max'),'expected_version',1,'title',repeat('😀',90),'objective',repeat('😀',2500),'hook',repeat('😀',1000),'caption',repeat('😀',6000),'content_line','Meme','rationale',repeat('😀',1000),'planned_for','2030-11-04T11:00:00Z','fact_ids','[]'::jsonb));
select knowledge_test.reject(jsonb_build_object('action','update_idea','id',current_setting('knowledge_test.idea_max'),'expected_version',2,'title','x','objective','','hook','','caption',repeat('😀',6000)||'x','content_line','Meme','rationale','','planned_for',null,'fact_ids','[]'::jsonb),'caption max12000','22023');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select public.marketing_knowledge_command(jsonb_build_object('action','review_source','id',current_setting('knowledge_test.source_max'),'expected_version',1,'decision','approve','reason','Reviewed'));
select set_config('knowledge_test.expired',public.marketing_knowledge_command(jsonb_build_object('action','create_fact','source_id',current_setting('knowledge_test.source_max'),'claim','Expired knowledge','claim_type','fact','category','general','valid_until','2000-01-01T00:00:00Z'))->>'id',true);
select knowledge_test.reject(jsonb_build_object('action','review_fact','id',current_setting('knowledge_test.expired'),'expected_version',1,'decision','verify','reason','Review'),'expired general cannot verify','22023');
-- At most ten facts and five deterministic proposals, deduplicated even for a fresh run.
select public.marketing_knowledge_command(jsonb_build_object('action','create_fact','source_id',current_setting('knowledge_test.source_max'),'claim','Bounded course evidence '||n,'claim_type','fact','category','course','valid_until','2099-01-01T00:00:00Z')) from generate_series(1,12) n;
select public.marketing_knowledge_command(jsonb_build_object('action','review_fact','id',id,'expected_version',1,'decision','verify','reason','Reviewed')) from public.marketing_facts where source_id=current_setting('knowledge_test.source_max')::uuid and category='course';
select set_config('knowledge_test.bounded_run',public.marketing_knowledge_command(jsonb_build_object('action','run_research','campaign_id',current_setting('knowledge_test.campaign'),'mode','internal_only','query','Bounded'))->>'id',true);
select knowledge_test.assert((select jsonb_array_length(evidence)=10 from public.marketing_research_runs where id=current_setting('knowledge_test.bounded_run')::uuid),'research max10');
select knowledge_test.assert(jsonb_array_length(public.marketing_knowledge_command(jsonb_build_object('action','generate_internal_ideas','run_id',current_setting('knowledge_test.bounded_run'),'content_line','InsideME')))=5,'generation max5');
select set_config('knowledge_test.bounded_run2',public.marketing_knowledge_command(jsonb_build_object('action','run_research','campaign_id',current_setting('knowledge_test.campaign'),'mode','internal_only','query','Bounded'))->>'id',true);
select public.marketing_knowledge_command(jsonb_build_object('action','generate_internal_ideas','run_id',current_setting('knowledge_test.bounded_run2'),'content_line','InsideME'));
select knowledge_test.assert((select count(*)=5 from public.marketing_ideas where content_line='InsideME'),'same evidence on fresh run deduplicates');
select set_config('knowledge_test.fresh_idea',(select id::text from public.marketing_ideas where content_line='InsideME' order by id limit 1),true);
select set_config('knowledge_test.fresh_fact',(select evidence->0->>'fact_id' from public.marketing_ideas where id=current_setting('knowledge_test.fresh_idea')::uuid),true);
select public.marketing_knowledge_command(jsonb_build_object('action','review_fact','id',current_setting('knowledge_test.fresh_fact'),'expected_version',2,'decision','dispute','reason','Disputed'));
select knowledge_test.reject(jsonb_build_object('action','select_idea','id',current_setting('knowledge_test.fresh_idea'),'expected_version',1),'disputed evidence blocks select','22023');
select public.marketing_knowledge_command(jsonb_build_object('action','review_fact','id',current_setting('knowledge_test.fresh_fact'),'expected_version',3,'decision','verify','reason','Reverified'));
select knowledge_test.reject(jsonb_build_object('action','select_idea','id',current_setting('knowledge_test.fresh_idea'),'expected_version',1),'reverified different version remains stale','22023');
select knowledge_test.reject(knowledge_test.idea_edit(current_setting('knowledge_test.fresh_idea')::uuid,jsonb_build_array(current_setting('knowledge_test.fresh_fact'))),'same IDs cannot refresh stale automatic fact versions','22023');
select set_config('knowledge_test.refreshed_run',public.marketing_knowledge_command(jsonb_build_object('action','run_research','campaign_id',current_setting('knowledge_test.campaign'),'mode','internal_only','query','Bounded'))->>'id',true);
select public.marketing_knowledge_command(jsonb_build_object('action','generate_internal_ideas','run_id',current_setting('knowledge_test.refreshed_run'),'content_line','InsideME'));
select knowledge_test.assert((select count(*)=1 from public.marketing_ideas where content_line='InsideME' and evidence->0->>'fact_id'=current_setting('knowledge_test.fresh_fact') and (evidence->0->>'fact_version')::integer=4 and id<>current_setting('knowledge_test.fresh_idea')::uuid),'new verified fact version produces fresh automatic idea');

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select set_config('knowledge_test.master',public.marketing_knowledge_command(jsonb_build_object('action','propose_dna','scope','master','team_id',null,'content_id',null,'base_version',0,'proposed',jsonb_set(current_setting('knowledge_test.payload')::jsonb,'{hard_rules}','["Never invent claims"]'),'reason','Master rules'))->>'id',true);
select public.marketing_knowledge_command(jsonb_build_object('action','apply_dna','id',current_setting('knowledge_test.master'),'expected_version',1,'confirmed',true));
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000005',true);
select knowledge_test.assert((select count(*)=0 from public.marketing_sources),'outsider source RLS');
select knowledge_test.assert((select count(*)=1 from public.marketing_dna_profiles),'active outsider reads only master');
select knowledge_test.assert((select count(*)=0 from public.marketing_dna_proposals),'master proposals Admin only');
select knowledge_test.assert((select count(*)=0 from public.marketing_knowledge_audit_logs),'master audit Admin only');
select knowledge_test.reject(jsonb_build_object('action','select_idea','id',current_setting('knowledge_test.idea'),'expected_version',1),'already selected still validates team','42501');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
select knowledge_test.reject(jsonb_build_object('action','run_research','campaign_id',current_setting('knowledge_test.campaign'),'mode','auto','query','course'),'viewer cannot mutate','42501');
select knowledge_test.reject_sql('update public.marketing_dna_versions set version=99','direct history mutation');
reset role;
select knowledge_test.reject_sql('update public.marketing_dna_versions set version=99','owner cannot rewrite immutable version');
select knowledge_test.reject_sql('update public.marketing_ideas set evidence=''[]'' where id='||quote_literal(current_setting('knowledge_test.bound_idea')),'owner cannot erase automatic idea provenance');
select knowledge_test.reject_sql('insert into public.marketing_ideas(campaign_id,team_id,title,objective,hook,caption,content_line,rationale,evidence,origin,creator_id) select campaign_id,team_id,title,objective,hook,caption,content_line,rationale,''[]''::jsonb,''rule_based'',creator_id from public.marketing_ideas limit 1','automatic evidence cannot be empty even on insertion','23514');

select knowledge_test.reject_sql('delete from public.marketing_knowledge_audit_logs','owner cannot remove audit');
select knowledge_test.reject_sql('update public.marketing_dna_proposals set proposed=jsonb_set(proposed,''{voice}'',''"Changed"'')','proposal payload immutable');
select to_jsonb(s) as roundtrip_source from public.marketing_sources s where id=current_setting('knowledge_test.source_max')::uuid;
select to_jsonb(i) as roundtrip_idea from public.marketing_ideas i where id=current_setting('knowledge_test.idea_max')::uuid;
-- Freshness is checked again when a previously valid run crosses fact expiry.
select set_config('knowledge_test.expiry_idea',(select id::text from public.marketing_ideas where content_line='InsideME' and (evidence->0->>'fact_version')::integer=2 and id<>current_setting('knowledge_test.fresh_idea')::uuid order by id limit 1),true);
update public.marketing_facts set valid_until='2000-01-01T00:00:00Z' where id=(select (evidence->0->>'fact_id')::uuid from public.marketing_ideas where id=current_setting('knowledge_test.expiry_idea')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select knowledge_test.reject(jsonb_build_object('action','select_idea','id',current_setting('knowledge_test.expiry_idea'),'expected_version',1),'expiry after research blocks selection','22023');
select knowledge_test.reject(jsonb_build_object('action','generate_internal_ideas','run_id',current_setting('knowledge_test.bounded_run'),'content_line','Meme'),'expiry after research blocks generation','22023');
select public.marketing_knowledge_command(jsonb_build_object('action','review_source','id',current_setting('knowledge_test.source_max'),'expected_version',2,'decision','approve','reason','Source rereviewed'));
select knowledge_test.reject(jsonb_build_object('action','select_idea','id',(select id from public.marketing_ideas where content_line='InsideME' and id<>current_setting('knowledge_test.expiry_idea')::uuid and id<>current_setting('knowledge_test.fresh_idea')::uuid order by id limit 1),'expected_version',1),'source version changed blocks selection','22023');
select knowledge_test.reject(knowledge_test.idea_edit(current_setting('knowledge_test.fresh_idea')::uuid,jsonb_build_array(current_setting('knowledge_test.fresh_fact'))),'original source version cannot be refreshed by edit','22023');
select set_config('knowledge_test.source_refreshed_run',public.marketing_knowledge_command(jsonb_build_object('action','run_research','campaign_id',current_setting('knowledge_test.campaign'),'mode','internal_only','query','Bounded'))->>'id',true);
select knowledge_test.assert((select count(*)=5 from jsonb_array_elements(public.marketing_knowledge_command(jsonb_build_object('action','generate_internal_ideas','run_id',current_setting('knowledge_test.source_refreshed_run'),'content_line','InsideME'))) idea where (idea->'evidence'->0->>'source_version')::integer=3),'new approved source version produces fresh automatic ideas');
select public.marketing_knowledge_command(jsonb_build_object('action','create_fact','source_id',current_setting('knowledge_test.source_max'),'claim',repeat('😀',1000),'claim_type','fact','category','general','valid_until','2099-01-01T00:00:00Z')) as roundtrip_fact;
select public.marketing_knowledge_command(jsonb_build_object('action','run_research','campaign_id',current_setting('knowledge_test.campaign'),'mode','internal_only','query',repeat('😀',1000))) as roundtrip_run;
select public.marketing_knowledge_command(jsonb_build_object('action','propose_dna','scope','team','team_id',current_setting('knowledge_test.team'),'content_id',null,'base_version',1,'proposed',jsonb_build_object('voice',repeat('😀',1000),'hooks',repeat('😀',1000),'cta',repeat('😀',1000),'visual_notes',repeat('😀',2000),'hard_rules','[]'::jsonb),'reason',repeat('😀',1000))) as roundtrip_proposal;
select public.marketing_command(jsonb_build_object('action','archive_campaign','id',current_setting('knowledge_test.campaign'),'expected_version',1));
select knowledge_test.reject(jsonb_build_object('action','select_idea','id',current_setting('knowledge_test.idea_max'),'expected_version',2),'archived campaign cannot select','22023');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select public.marketing_knowledge_command(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title','Maximum URL','kind','public_reference','url','https://example.org/'||repeat('x',1980),'excerpt','Public source','author',null,'published_at',null)) as roundtrip_source;
select public.marketing_knowledge_command(jsonb_build_object('action','propose_dna','scope','master','team_id',null,'content_id',null,'base_version',1,'proposed',jsonb_build_object('voice','','hooks','','cta','','visual_notes','','hard_rules',(select jsonb_agg(repeat('😀',100)) from generate_series(1,20))),'reason','Maximum hard rules')) as roundtrip_proposal;
select knowledge_test.reject(jsonb_build_object('action','create_source','team_id',current_setting('knowledge_test.team'),'title','Bad','kind','public_reference','url','https://example.org/'||repeat('é',1980),'excerpt','x','author',null,'published_at',null),'URL cannot expand beyond API limit on canonicalization','22023');
select knowledge_test.reject(jsonb_build_object('action','create_fact','source_id',current_setting('knowledge_test.source_max'),'claim','x','claim_type','fact','category','general','valid_until','1000-01-01T00:00:00+07:00'),'timestamp UTC lower bound','22023');
select knowledge_test.reject(jsonb_build_object('action','create_fact','source_id',current_setting('knowledge_test.source_max'),'claim','x','claim_type','fact','category','general','valid_until','9999-12-31T23:59:00-07:00'),'timestamp UTC upper bound','22023');
reset role;
-- Live account and role revocation are honored before idempotence.
update public.profiles set status='locked' where id='20000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select knowledge_test.reject(jsonb_build_object('action','select_idea','id',current_setting('knowledge_test.idea'),'expected_version',1),'locked actor retry denied','42501');
reset role;
rollback;
