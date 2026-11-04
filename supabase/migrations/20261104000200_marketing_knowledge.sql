-- Additive Phase 2. Internal deterministic research only; no provider or network calls.
begin;
create function marketing_private.knowledge_text(value text, maximum integer, required boolean default false) returns boolean language sql immutable set search_path='' as $$
 select value is not null and marketing_private.text_length(value)<=maximum and (not required or length(marketing_private.trim_text(value))>0);
$$;
create function marketing_private.knowledge_url(value text) returns boolean language plpgsql immutable set search_path='' as $$
declare authority text; host text; query text;
begin
 if value is null then return true; end if;
 if marketing_private.text_length(value)>2000 or value ~ '[^!-~]' or value ~ '["<>`{}^|]' or position('''' in value)>0 or value !~ '^https://[^/?#[:space:]]+' or value ~ '[[:space:]\\]' then return false; end if;
 authority:=substring(value from '^https://([^/?#]+)');
 if authority ~ '[@%\[\]]' or authority ~ ':[^0-9]' then return false; end if;
 host:=lower(split_part(authority,':',1));
 if length(host)>253 or exists(select 1 from regexp_split_to_table(host,'\.') label where length(label)>63) or host !~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$' or host ~ '(^|\.)(localhost|local|internal|invalid|test|example|onion)$' or host ~ '(^|\.)(localdomain|home|lan)$' then return false; end if;
 if authority like '%:%' and (split_part(authority,':',2)!~'^[0-9]{1,5}$' or split_part(authority,':',2)::integer<>443) then return false; end if;
 query:=lower(split_part(split_part(value,'?',2),'#',1));
 if query ~ '(^|&)([^=&]*(token|secret|password|passwd|authorization|credential|api[_-]?key|access[_-]?key|signature|^code$|^key$)[^=&]*)(=|&|$)' or query ~ '(^|&)(code|key)(=|&|$)' or query ~* 'sk-(proj-)?[a-z0-9_-]{10,}|Bearer' or query ~ '%' then return false; end if;
 return true;
end $$;
create function marketing_private.valid_dna(value jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text; item jsonb;
begin
 if jsonb_typeof(value) is distinct from 'object' or not(value ?& array['voice','hooks','cta','visual_notes','hard_rules']) or (select count(*) from jsonb_object_keys(value))<>5 then return false; end if;
 foreach k in array array['voice','hooks','cta','visual_notes'] loop
  if jsonb_typeof(value->k) is distinct from 'string' or not marketing_private.knowledge_text(value->>k,case when k='visual_notes' then 4000 else 2000 end) then return false; end if;
 end loop;
 if jsonb_typeof(value->'hard_rules') is distinct from 'array' or jsonb_array_length(value->'hard_rules')>20 then return false; end if;
 for item in select * from jsonb_array_elements(value->'hard_rules') loop
  if jsonb_typeof(item) is distinct from 'string' or not marketing_private.knowledge_text(item#>>'{}',200,true) then return false; end if;
 end loop;
 return true;
end $$;
create table public.marketing_sources(
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.marketing_teams(id),
 title text not null check(marketing_private.knowledge_text(title,180,true)), kind text not null check(kind in('member_brief','official_website','approved_history','public_reference')),
 url text check(marketing_private.knowledge_url(url)), excerpt text not null check(marketing_private.knowledge_text(excerpt,8000,true)), author text check(author is null or marketing_private.knowledge_text(author,200)),
 published_at date check(published_at is null or isfinite(published_at)), collected_at timestamptz not null default now(),
 status text not null default 'pending' check(status in('pending','approved','revoked')), creator_id uuid not null references public.profiles(id), reviewer_id uuid references public.profiles(id), reviewed_at timestamptz,
 version integer not null default 1 check(version>0), created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,team_id)
);
create table public.marketing_facts(
 id uuid primary key default gen_random_uuid(),team_id uuid not null references public.marketing_teams(id),source_id uuid not null,
 claim text not null check(marketing_private.knowledge_text(claim,2000,true)),claim_type text not null check(claim_type in('fact','hypothesis','missing_verification')),
 category text not null check(category in('general','course','offer','scholarship','event','people')),valid_until timestamptz check(valid_until is null or isfinite(valid_until)),
 status text not null default 'pending' check(status in('pending','verified','disputed')),creator_id uuid not null references public.profiles(id),reviewer_id uuid references public.profiles(id),reviewed_at timestamptz,
 version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(source_id,team_id) references public.marketing_sources(id,team_id),check(status<>'verified' or (claim_type='fact' and (category='general' or valid_until is not null)))
);
create table public.marketing_research_runs(
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null,team_id uuid not null,mode text not null check(mode in('auto','internal_only','deep_research')),query text not null check(marketing_private.knowledge_text(query,2000,true)),
 strategy text not null check(strategy in('internal','internal_fallback','external_unavailable')),status text not null check(status in('completed','not_configured')),evidence jsonb not null default '[]' check(jsonb_typeof(evidence)='array' and jsonb_array_length(evidence)<=10),warnings jsonb not null default '[]',
 creator_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),foreign key(campaign_id,team_id) references public.marketing_campaigns(id,team_id),unique(id,campaign_id,team_id)
);
create table public.marketing_ideas(
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null,team_id uuid not null,
 title text not null check(marketing_private.knowledge_text(title,180,true)),objective text not null check(marketing_private.knowledge_text(objective,5000)),hook text not null check(marketing_private.knowledge_text(hook,2000)),caption text not null check(marketing_private.knowledge_text(caption,12000)),content_line text not null check(content_line in('ColorMAP','Sharing','Meme','InsideME')),rationale text not null check(marketing_private.knowledge_text(rationale,2000)),
 evidence jsonb not null default '[]' check(jsonb_typeof(evidence)='array' and jsonb_array_length(evidence)<=10),source_run_id uuid,origin text not null check(origin in('manual','rule_based')),planned_for timestamptz check(planned_for is null or isfinite(planned_for)),
 status text not null default 'proposed' check(status in('proposed','selected','dismissed')),content_id uuid unique references public.marketing_content_items(id),creator_id uuid not null references public.profiles(id),version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),suggestion_key text,
 foreign key(campaign_id,team_id) references public.marketing_campaigns(id,team_id),foreign key(source_run_id,campaign_id,team_id) references public.marketing_research_runs(id,campaign_id,team_id),unique(campaign_id,suggestion_key),check((status='selected')=(content_id is not null)),check(origin<>'rule_based' or jsonb_array_length(evidence)>0)
);
create table public.marketing_dna_profiles(
 id uuid primary key default gen_random_uuid(),scope text not null check(scope in('master','team','post')),team_id uuid references public.marketing_teams(id),content_id uuid references public.marketing_content_items(id),payload jsonb not null check(marketing_private.valid_dna(payload)),version integer not null check(version>0),creator_id uuid not null references public.profiles(id),approved_by uuid not null references public.profiles(id),approved_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((scope='master' and team_id is null and content_id is null) or (scope='team' and team_id is not null and content_id is null) or (scope='post' and team_id is not null and content_id is not null)),check(scope='master' or payload->'hard_rules'='[]'::jsonb)
);
create unique index marketing_dna_master_unique on public.marketing_dna_profiles(scope) where scope='master';
create unique index marketing_dna_team_unique on public.marketing_dna_profiles(team_id) where scope='team';
create unique index marketing_dna_post_unique on public.marketing_dna_profiles(content_id) where scope='post';
create table public.marketing_dna_proposals(
 id uuid primary key default gen_random_uuid(),scope text not null check(scope in('master','team','post')),team_id uuid references public.marketing_teams(id),content_id uuid references public.marketing_content_items(id),base_version integer not null check(base_version>=0),previous jsonb check(previous is null or marketing_private.valid_dna(previous)),proposed jsonb not null check(marketing_private.valid_dna(proposed)),reason text not null check(marketing_private.knowledge_text(reason,2000,true)),status text not null default 'pending' check(status in('pending','applied','rejected')),creator_id uuid not null references public.profiles(id),reviewer_id uuid references public.profiles(id),reviewed_at timestamptz,version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((scope='master' and team_id is null and content_id is null) or (scope='team' and team_id is not null and content_id is null) or (scope='post' and team_id is not null and content_id is not null)),check(scope='master' or proposed->'hard_rules'='[]'::jsonb)
);
create table public.marketing_dna_versions(
 id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.marketing_dna_profiles(id),scope text not null,team_id uuid references public.marketing_teams(id),content_id uuid references public.marketing_content_items(id),version integer not null,payload jsonb not null,proposal_id uuid not null unique references public.marketing_dna_proposals(id),actor_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(profile_id,version)
);
create table public.marketing_knowledge_audit_logs(
 id uuid primary key default gen_random_uuid(),team_id uuid references public.marketing_teams(id),entity_type text not null,entity_id uuid not null,version integer,action text not null,actor_id uuid not null references public.profiles(id),snapshot jsonb not null,created_at timestamptz not null default now()
);
create index marketing_facts_team_source_idx on public.marketing_facts(team_id,source_id);
create index marketing_sources_team_idx on public.marketing_sources(team_id,status);
create index marketing_ideas_campaign_idx on public.marketing_ideas(campaign_id,status);
create function marketing_private.knowledge_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or tg_table_name in('marketing_research_runs','marketing_dna_versions','marketing_knowledge_audit_logs') then raise exception 'History is immutable' using errcode='42501'; end if;
 if new.creator_id<>old.creator_id or new.team_id is distinct from old.team_id or new.created_at<>old.created_at then raise exception 'Creator and scope are immutable' using errcode='42501'; end if;
 if tg_table_name in('marketing_dna_profiles','marketing_dna_proposals') then
  if new.scope<>old.scope or new.content_id is distinct from old.content_id then raise exception 'DNA scope is immutable' using errcode='42501';end if;
 end if;
 if tg_table_name='marketing_dna_proposals' then
 if (new.proposed<>old.proposed or new.previous is distinct from old.previous or new.base_version<>old.base_version or new.reason<>old.reason or new.scope<>old.scope or new.content_id is distinct from old.content_id or old.status<>'pending') then raise exception 'Proposal is immutable' using errcode='42501'; end if; end if;
 if tg_table_name='marketing_ideas' then
 if old.origin='rule_based' and new.evidence is distinct from old.evidence then raise exception 'Automatic idea evidence is immutable' using errcode='42501';end if;
 if (old.status='selected' or new.campaign_id<>old.campaign_id or new.origin<>old.origin or new.source_run_id is distinct from old.source_run_id) then raise exception 'Selected idea and origin are immutable' using errcode='42501'; end if; end if;
 return new;
end $$;
create function marketing_private.knowledge_read(p_scope text,p_team uuid,master_admin boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select case when p_scope='master' then exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.id where p.id=auth.uid() and p.status='active' and (not master_admin or r.role='Admin')) else marketing_private.can_read(p_team) end;
$$;
do $$ declare t text; policy text; begin
 foreach t in array array['marketing_sources','marketing_facts','marketing_research_runs','marketing_ideas','marketing_dna_profiles','marketing_dna_proposals','marketing_dna_versions','marketing_knowledge_audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on public.%I to authenticated',t);
 policy:=case when t in('marketing_dna_profiles','marketing_dna_versions') then 'marketing_private.knowledge_read(scope,team_id)' when t='marketing_dna_proposals' then 'marketing_private.knowledge_read(scope,team_id,true)' when t='marketing_knowledge_audit_logs' then 'marketing_private.knowledge_read(case when team_id is null then ''master'' else ''team'' end,team_id,true)' else 'marketing_private.can_read(team_id)' end;
 execute format('create policy knowledge_read on public.%I for select to authenticated using (%s)',t,policy);
 execute format('create trigger knowledge_immutable before update or delete on public.%I for each row execute function marketing_private.knowledge_guard()',t);
 end loop;
end $$;
-- Lock each evidence source before its fact, including current versions, through commit.
create function marketing_private.knowledge_evidence(p_team uuid,refs jsonb) returns void language plpgsql set search_path='' as $$
declare r jsonb; f public.marketing_facts%rowtype;s public.marketing_sources%rowtype;
begin
 if jsonb_typeof(refs) is distinct from 'array' or jsonb_array_length(refs)>10 then raise exception 'Invalid evidence' using errcode='22023'; end if;
 for r in select * from jsonb_array_elements(refs) order by value->>'source_id',value->>'fact_id' loop
 select * into s from public.marketing_sources where id=(r->>'source_id')::uuid and team_id=p_team for share;
 select * into f from public.marketing_facts where id=(r->>'fact_id')::uuid and team_id=p_team for share;
 if f.id is null or s.id is null or f.source_id<>s.id or f.version<>(r->>'fact_version')::integer or s.version<>(r->>'source_version')::integer or f.status<>'verified' or f.claim_type<>'fact' or s.status<>'approved' or (f.valid_until is not null and f.valid_until<=clock_timestamp()) or (f.category<>'general' and f.valid_until is null) then raise exception 'Evidence is stale or unavailable' using errcode='22023'; end if;
 end loop;
end $$;
create function marketing_private.knowledge_fact_refs(p_team uuid,ids jsonb) returns jsonb language plpgsql set search_path='' as $$
declare result jsonb;
begin
 if jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids)>10 or (select count(distinct value) from jsonb_array_elements(ids))<>jsonb_array_length(ids) then raise exception 'Invalid fact IDs' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(ids) v where jsonb_typeof(v)<>'string' or v#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then raise exception 'Invalid fact UUID' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('fact_id',f.id,'fact_version',f.version,'source_id',s.id,'source_version',s.version) order by f.id),'[]') into result from public.marketing_facts f join public.marketing_sources s on s.id=f.source_id where f.team_id=p_team and f.id in(select (value#>>'{}')::uuid from jsonb_array_elements(ids));
 if jsonb_array_length(result)<>jsonb_array_length(ids) then raise exception 'Fact unavailable' using errcode='42501'; end if;
 perform marketing_private.knowledge_evidence(p_team,result);return result;
end $$;
create function marketing_private.knowledge_command(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();action text:=p_command->>'action';admin boolean;manager boolean;writer boolean;allowed text[];k text;maximum integer;team uuid;scope_name text;target_content uuid;result jsonb;entity text;entity_id uuid;revision integer;refs jsonb;previous_payload jsonb;current_version integer;key text;entry jsonb;output jsonb:='[]';
 s public.marketing_sources%rowtype;f public.marketing_facts%rowtype;c public.marketing_campaigns%rowtype;r public.marketing_research_runs%rowtype;i public.marketing_ideas%rowtype;p public.marketing_dna_proposals%rowtype;d public.marketing_dna_profiles%rowtype;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform 1 from public.profiles where id=actor and status='active' for share;
 if not found then raise exception 'Active account required' using errcode='42501'; end if;
 perform 1 from public.user_roles where user_id=actor order by role for share;
 select exists(select 1 from public.user_roles where user_id=actor and role='Admin'),exists(select 1 from public.user_roles where user_id=actor and role in('Admin','PR Leader')),exists(select 1 from public.user_roles where user_id=actor and role in('Admin','PR Leader','PR Representative')) into admin,manager,writer;
 if not writer then raise exception 'Write permission required' using errcode='42501'; end if;
 if jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>1000000 then raise exception 'Invalid command' using errcode='22023'; end if;
 allowed:=case action
 when 'create_source' then array['action','team_id','title','kind','url','excerpt','author','published_at']
 when 'review_source' then array['action','id','expected_version','decision','reason']
 when 'create_fact' then array['action','source_id','claim','claim_type','category','valid_until']
 when 'review_fact' then array['action','id','expected_version','decision','reason']
 when 'run_research' then array['action','campaign_id','mode','query']
 when 'generate_internal_ideas' then array['action','run_id','content_line']
 when 'create_idea' then array['action','campaign_id','title','objective','hook','caption','content_line','rationale','planned_for','fact_ids']
 when 'update_idea' then array['action','id','expected_version','title','objective','hook','caption','content_line','rationale','planned_for','fact_ids']
 when 'select_idea' then array['action','id','expected_version']
 when 'dismiss_idea' then array['action','id','expected_version']
 when 'propose_dna' then array['action','scope','team_id','content_id','base_version','proposed','reason']
 when 'apply_dna' then array['action','id','expected_version','confirmed']
 when 'reject_dna' then array['action','id','expected_version','reason'] end;
 if allowed is null or not(p_command ?& allowed) or exists(select 1 from jsonb_object_keys(p_command) x where not(x=any(allowed))) then raise exception 'Unsupported command or fields; nullable fields must be explicit' using errcode='22023'; end if;
 foreach k in array allowed loop
  if k in('action','team_id','source_id','id','run_id','campaign_id','content_id','title','kind','url','excerpt','author','published_at','decision','reason','claim','claim_type','category','valid_until','mode','query','objective','hook','caption','content_line','rationale','planned_for','scope') then
   if p_command->k='null'::jsonb then
    if k not in('url','author','published_at','valid_until','planned_for') and not(action='propose_dna' and k in('team_id','content_id')) then raise exception 'Non-null field required: %',k using errcode='22023'; end if;
   elsif jsonb_typeof(p_command->k)<>'string' then raise exception 'Expected string: %',k using errcode='22023'; end if;
  end if;
 end loop;
 foreach k in array array['team_id','source_id','id','run_id','campaign_id','content_id'] loop
  if p_command ? k and p_command->k<>'null'::jsonb and p_command->>k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'Invalid UUID: %',k using errcode='22023'; end if;
 end loop;
 foreach k in array array['expected_version','base_version'] loop
  if p_command ? k and (jsonb_typeof(p_command->k) is distinct from 'number' or (p_command->>k)::numeric<case when k='base_version' then 0 else 1 end or (p_command->>k)::numeric>9007199254740991 or (p_command->>k)::numeric<>trunc((p_command->>k)::numeric)) then raise exception 'Invalid version' using errcode='22023'; end if;
 end loop;
 foreach k in array array['title','excerpt','author','claim','reason','objective','hook','caption','rationale','query'] loop
  if p_command ? k and p_command->k<>'null'::jsonb then
   maximum:=case k when 'title' then 180 when 'excerpt' then 8000 when 'author' then 200 when 'objective' then 5000 when 'caption' then 12000 else 2000 end;
   if not marketing_private.knowledge_text(p_command->>k,maximum,k in('title','excerpt','claim','reason','query')) then raise exception 'Invalid text length: %',k using errcode='22023'; end if;
   p_command:=jsonb_set(p_command,array[k],to_jsonb(marketing_private.trim_text(p_command->>k)));
  end if;
 end loop;
 if p_command ? 'url' and not marketing_private.knowledge_url(p_command->>'url') then raise exception 'Public HTTPS URL required' using errcode='22023'; end if;
 if p_command ? 'published_at' and p_command->'published_at'<>'null'::jsonb then
  if p_command->>'published_at' !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' then raise exception 'Expected ISO date' using errcode='22023'; end if;
  begin perform (p_command->>'published_at')::date; exception when datetime_field_overflow or invalid_datetime_format then raise exception 'Invalid date' using errcode='22023';end;
 end if;
 foreach k in array array['valid_until','planned_for'] loop
  if p_command ? k and p_command->k<>'null'::jsonb then
   if p_command->>k !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?(Z|[+-][0-9]{2}:[0-9]{2})$' or substring(p_command->>k from 12 for 2)::integer>23 or substring(p_command->>k from 15 for 2)::integer>59 or (substring(p_command->>k from 17 for 1)=':' and substring(p_command->>k from 18 for 2)::integer>59) then raise exception 'Explicit valid timestamp required' using errcode='22023'; end if;
   begin
    if extract(year from (p_command->>k)::timestamptz at time zone 'UTC') not between 1000 and 9999 then raise exception 'Timestamp outside supported UTC years' using errcode='22023';end if;
    perform (p_command->>k)::timestamptz;exception when datetime_field_overflow or invalid_datetime_format then raise exception 'Invalid timestamp' using errcode='22023';end;
  end if;
 end loop;
 if p_command ? 'content_line' and p_command->>'content_line' not in('ColorMAP','Sharing','Meme','InsideME') then raise exception 'Invalid content line' using errcode='22023'; end if;
 -- Resolve and lock scope before any mutation. Campaign is always locked before idea.
 if action='create_source' then team:=(p_command->>'team_id')::uuid;
 elsif action='review_source' then select * into s from public.marketing_sources where id=(p_command->>'id')::uuid for update;team:=s.team_id;
 elsif action='create_fact' then select * into s from public.marketing_sources where id=(p_command->>'source_id')::uuid for share;team:=s.team_id;
 elsif action='review_fact' then
  select * into f from public.marketing_facts where id=(p_command->>'id')::uuid;
  select * into s from public.marketing_sources where id=f.source_id for share;
  select * into f from public.marketing_facts where id=(p_command->>'id')::uuid for update;team:=f.team_id;
 elsif action in('run_research','create_idea') then select * into c from public.marketing_campaigns where id=(p_command->>'campaign_id')::uuid for update;team:=c.team_id;
 elsif action='generate_internal_ideas' then
  select * into r from public.marketing_research_runs where id=(p_command->>'run_id')::uuid;select * into c from public.marketing_campaigns where id=r.campaign_id for update;team:=r.team_id;
 elsif action in('update_idea','select_idea','dismiss_idea') then
  select * into i from public.marketing_ideas where id=(p_command->>'id')::uuid;select * into c from public.marketing_campaigns where id=i.campaign_id for update;
  select * into i from public.marketing_ideas where id=(p_command->>'id')::uuid for update;team:=i.team_id;
 elsif action='propose_dna' then scope_name:=p_command->>'scope';team:=(p_command->>'team_id')::uuid;target_content:=(p_command->>'content_id')::uuid;
 else select * into p from public.marketing_dna_proposals where id=(p_command->>'id')::uuid for update;scope_name:=p.scope;team:=p.team_id;target_content:=p.content_id;
 end if;
 if action in('propose_dna','apply_dna','reject_dna') then
  if scope_name not in('master','team','post') or scope_name is null then raise exception 'DNA unavailable' using errcode='42501'; end if;
  if scope_name='master' then if not admin then raise exception 'Admin required' using errcode='42501';end if;
   if team is not null or target_content is not null then raise exception 'Invalid master scope' using errcode='22023';end if;
  elsif scope_name='team' and target_content is not null then raise exception 'Invalid team scope' using errcode='22023';
  elsif scope_name='post' then
   perform 1 from public.marketing_content_items where id=target_content and team_id=team for share;
   if not found then raise exception 'Scoped post required' using errcode='42501';end if;
  end if;
 end if;
 if scope_name is distinct from 'master' then
  if team is null then raise exception 'Entity unavailable' using errcode='42501';end if;
  perform 1 from public.marketing_teams where id=team for share;
  if not found then raise exception 'Team unavailable' using errcode='42501';end if;
  if not admin then perform 1 from public.marketing_team_memberships where team_id=team and user_id=actor for share;
   if not found then raise exception 'Team membership required' using errcode='42501';end if;
  end if;
 end if;
 if action in('review_source','review_fact') and not manager then raise exception 'Leader or Admin required' using errcode='42501';end if;
 if action='select_idea' and i.status='selected' then return to_jsonb(i);end if;
 if p_command ? 'expected_version' then
  current_version:=case when action='review_source' then s.version when action='review_fact' then f.version when action in('update_idea','select_idea','dismiss_idea') then i.version else p.version end;
  if current_version is distinct from (p_command->>'expected_version')::numeric then raise exception 'Version conflict' using errcode='40001';end if;
 end if;
 if action='create_source' then
  if p_command->>'kind'<>'member_brief' and p_command->'url'='null'::jsonb then raise exception 'Source URL required' using errcode='22023';end if;
  insert into public.marketing_sources(team_id,title,kind,url,excerpt,author,published_at,creator_id) values(team,p_command->>'title',p_command->>'kind',p_command->>'url',p_command->>'excerpt',p_command->>'author',(p_command->>'published_at')::date,actor) returning * into s;result:=to_jsonb(s);entity:='source';
 elsif action='review_source' then
  if p_command->>'decision' not in('approve','revoke') then raise exception 'Invalid source decision' using errcode='22023';end if;
  update public.marketing_sources set status=case when p_command->>'decision'='approve' then 'approved' else 'revoked' end,reviewer_id=actor,reviewed_at=now(),version=version+1,updated_at=now() where id=s.id returning * into s;result:=to_jsonb(s);entity:='source';
 elsif action='create_fact' then
  insert into public.marketing_facts(team_id,source_id,claim,claim_type,category,valid_until,creator_id) values(team,s.id,p_command->>'claim',p_command->>'claim_type',p_command->>'category',(p_command->>'valid_until')::timestamptz,actor) returning * into f;result:=to_jsonb(f);entity:='fact';
 elsif action='review_fact' then
  if p_command->>'decision' not in('verify','dispute') then raise exception 'Invalid fact decision' using errcode='22023';end if;
  if p_command->>'decision'='verify' and (f.claim_type<>'fact' or s.status<>'approved' or (f.valid_until is not null and f.valid_until<=clock_timestamp()) or (f.category<>'general' and f.valid_until is null)) then raise exception 'Factual claim, approved source and future expiry required' using errcode='22023';end if;
  update public.marketing_facts set status=case when p_command->>'decision'='verify' then 'verified' else 'disputed' end,reviewer_id=actor,reviewed_at=now(),version=version+1,updated_at=now() where id=f.id returning * into f;result:=to_jsonb(f);entity:='fact';
 elsif action='run_research' then
  if p_command->>'mode' not in('auto','internal_only','deep_research') then raise exception 'Invalid research mode' using errcode='22023';end if;
  refs:='[]';
  if p_command->>'mode'<>'deep_research' then
   select coalesce(jsonb_agg(jsonb_build_object('fact_id',x.id,'fact_version',x.version,'source_id',x.source_id,'source_version',x.source_version) order by x.id),'[]') into refs from (
    select fact.id,fact.version,fact.source_id,src.version source_version from public.marketing_facts fact join public.marketing_sources src on src.id=fact.source_id where fact.team_id=team and fact.status='verified' and fact.claim_type='fact' and src.status='approved' and (fact.valid_until is null or fact.valid_until>clock_timestamp()) and (fact.category='general' or fact.valid_until is not null)
    and exists(select 1 from regexp_split_to_table(lower(p_command->>'query'),'[[:space:]]+') term where term<>'' and (position(term in lower(fact.claim))>0 or position(term in lower(src.title))>0)) order by fact.id limit 10
   ) x;
   perform marketing_private.knowledge_evidence(team,refs);
  end if;
  insert into public.marketing_research_runs(campaign_id,team_id,mode,query,strategy,status,evidence,warnings,creator_id) values(c.id,team,p_command->>'mode',p_command->>'query',case p_command->>'mode' when 'auto' then 'internal_fallback' when 'deep_research' then 'external_unavailable' else 'internal' end,case when p_command->>'mode'='deep_research' then 'not_configured' else 'completed' end,refs,case p_command->>'mode' when 'auto' then '["External research is not configured; searched approved internal facts only."]'::jsonb when 'deep_research' then '["External research is not configured. No external request was made."]'::jsonb else '[]'::jsonb end,actor) returning * into r;result:=to_jsonb(r);entity:='research_run';
 elsif action='generate_internal_ideas' then
  if r.status<>'completed' then raise exception 'Completed internal research required' using errcode='22023';end if;
  perform marketing_private.knowledge_evidence(team,r.evidence);
  for entry in select * from jsonb_array_elements(r.evidence) limit 5 loop
   select * into f from public.marketing_facts where id=(entry->>'fact_id')::uuid;select * into s from public.marketing_sources where id=f.source_id;
   key:='fact:'||f.id||':'||f.version||':source:'||s.version||':line:'||(p_command->>'content_line');
   insert into public.marketing_ideas(campaign_id,team_id,title,objective,hook,caption,content_line,rationale,evidence,source_run_id,origin,creator_id,suggestion_key)
   values(c.id,team,'Góc nội dung: '||left(f.claim,70),'Trình bày dữ kiện đã được thành viên duyệt.',f.claim,f.claim||case when s.url is not null then E'\nNguồn: '||s.url else E'\nNguồn nội bộ: '||s.title end,p_command->>'content_line','Đề xuất theo quy tắc từ một dữ kiện nội bộ; cần biên tập và duyệt trước khi sử dụng.',jsonb_build_array(entry),r.id,'rule_based',actor,key) on conflict(campaign_id,suggestion_key) do nothing returning * into i;
   if not found then select * into i from public.marketing_ideas where campaign_id=c.id and suggestion_key=key;end if;
   output:=output||jsonb_build_array(to_jsonb(i));
  end loop;
  result:=output;entity:='research_run';entity_id:=r.id;
 elsif action in('create_idea','update_idea') then
  if action='update_idea' and i.status<>'proposed' then raise exception 'Only proposed ideas can change' using errcode='22023';end if;
  if action='update_idea' and i.origin='rule_based' then
   if jsonb_array_length(i.evidence)=0 then raise exception 'Automatic idea requires original evidence' using errcode='22023';end if;
   perform marketing_private.knowledge_evidence(team,i.evidence);
  end if;
  refs:=marketing_private.knowledge_fact_refs(team,p_command->'fact_ids');
  if action='update_idea' and i.origin='rule_based' then
   if not(refs @> i.evidence and i.evidence @> refs) then raise exception 'Automatic idea must retain its exact original evidence' using errcode='22023';end if;
   refs:=i.evidence;
  end if;
  if action='create_idea' then
   insert into public.marketing_ideas(campaign_id,team_id,title,objective,hook,caption,content_line,rationale,evidence,planned_for,origin,creator_id) values(c.id,team,p_command->>'title',p_command->>'objective',p_command->>'hook',p_command->>'caption',p_command->>'content_line',p_command->>'rationale',refs,(p_command->>'planned_for')::timestamptz,'manual',actor) returning * into i;
  else update public.marketing_ideas set title=p_command->>'title',objective=p_command->>'objective',hook=p_command->>'hook',caption=p_command->>'caption',content_line=p_command->>'content_line',rationale=p_command->>'rationale',evidence=refs,planned_for=(p_command->>'planned_for')::timestamptz,version=version+1,updated_at=now() where id=i.id returning * into i;end if;
  result:=to_jsonb(i);entity:='idea';
 elsif action='dismiss_idea' then
  if i.status<>'proposed' then raise exception 'Only proposed ideas can be dismissed' using errcode='22023';end if;
  update public.marketing_ideas set status='dismissed',version=version+1,updated_at=now() where id=i.id returning * into i;result:=to_jsonb(i);entity:='idea';
 elsif action='select_idea' then
  if i.status<>'proposed' or c.status not in('draft','active') then raise exception 'Proposed idea in Draft or Active campaign required' using errcode='22023';end if;
  if i.origin='rule_based' and jsonb_array_length(i.evidence)=0 then raise exception 'Automatic idea requires original evidence' using errcode='22023';end if;
  perform marketing_private.knowledge_evidence(team,i.evidence);
  result:=marketing_private.command(jsonb_build_object('action','create_content','campaign_id',c.id,'title',i.title,'caption',i.caption,'content_line',i.content_line,'assignee_id',null,'production_status','not_started','production_due_at',null,'review_due_at',null,'proposed_publish_at',null));
  update public.marketing_ideas set status='selected',content_id=(result->>'id')::uuid,version=version+1,updated_at=now() where id=i.id returning * into i;result:=to_jsonb(i);entity:='idea';
 elsif action='propose_dna' then
  if not marketing_private.valid_dna(p_command->'proposed') or (scope_name<>'master' and p_command->'proposed'->'hard_rules'<>'[]'::jsonb) then raise exception 'Invalid DNA or child hard rules' using errcode='22023';end if;
  select * into d from public.marketing_dna_profiles where scope=scope_name and team_id is not distinct from team and content_id is not distinct from target_content for share;
  if coalesce(d.version,0)<>(p_command->>'base_version')::numeric then raise exception 'DNA base version conflict' using errcode='40001';end if;
  insert into public.marketing_dna_proposals(scope,team_id,content_id,base_version,previous,proposed,reason,creator_id) values(scope_name,team,target_content,coalesce(d.version,0),d.payload,p_command->'proposed',p_command->>'reason',actor) returning * into p;result:=to_jsonb(p);entity:='dna_proposal';
 elsif action in('apply_dna','reject_dna') then
  if scope_name='team' and not manager then raise exception 'Scoped Leader or Admin required' using errcode='42501';end if;
  if p.status<>'pending' then raise exception 'Pending proposal required' using errcode='22023';end if;
  if action='apply_dna' then
   if p_command->'confirmed' is distinct from 'true'::jsonb then raise exception 'Explicit diff confirmation required' using errcode='22023';end if;
   -- Serialize even profile creation; unique indexes remain the final concurrency guard.
   perform pg_advisory_xact_lock(hashtextextended('marketing_dna:'||scope_name||':'||coalesce(team::text,'')||':'||coalesce(target_content::text,''),0));
   select * into d from public.marketing_dna_profiles where scope=scope_name and team_id is not distinct from team and content_id is not distinct from target_content for update;
   if coalesce(d.version,0)<>p.base_version then raise exception 'DNA base version conflict' using errcode='40001';end if;
   if d.id is null then insert into public.marketing_dna_profiles(scope,team_id,content_id,payload,version,creator_id,approved_by) values(scope_name,team,target_content,p.proposed,1,actor,actor) returning * into d;
   else update public.marketing_dna_profiles set payload=p.proposed,version=version+1,approved_by=actor,approved_at=now(),updated_at=now() where id=d.id returning * into d;end if;
   insert into public.marketing_dna_versions(profile_id,scope,team_id,content_id,version,payload,proposal_id,actor_id) values(d.id,scope_name,team,target_content,d.version,d.payload,p.id,actor);
  end if;
  update public.marketing_dna_proposals set status=case when action='apply_dna' then 'applied' else 'rejected' end,reviewer_id=actor,reviewed_at=now(),version=version+1,updated_at=now() where id=p.id returning * into p;
  result:=to_jsonb(p);entity:='dna_proposal';
 end if;
 entity_id:=coalesce(entity_id,(result->>'id')::uuid);revision:=(result->>'version')::integer;
 insert into public.marketing_knowledge_audit_logs(team_id,entity_type,entity_id,version,action,actor_id,snapshot) values(team,entity,entity_id,revision,action,actor,jsonb_build_object('row',result,'reason',p_command->>'reason'));
 return result;
end $$;
create function public.marketing_knowledge_command(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$ select marketing_private.knowledge_command(p_command); $$;
revoke all on function public.marketing_knowledge_command(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.marketing_knowledge_command(jsonb) to authenticated;
revoke all on function marketing_private.knowledge_text(text,integer,boolean),marketing_private.knowledge_url(text),marketing_private.valid_dna(jsonb),marketing_private.knowledge_guard(),marketing_private.knowledge_read(text,uuid,boolean),marketing_private.knowledge_evidence(uuid,jsonb),marketing_private.knowledge_fact_refs(uuid,jsonb),marketing_private.knowledge_command(jsonb) from public,anon,authenticated,service_role;
grant execute on function marketing_private.knowledge_command(jsonb),marketing_private.knowledge_read(text,uuid,boolean) to authenticated;
comment on function public.marketing_knowledge_command(jsonb) is 'Phase 2 scoped transactional commands. Deterministic internal research/ideas, human review and explicitly confirmed DNA. No network, provider, publishing or scheduling.';
commit;
