-- Local additive Phase 4 migration; no remote migration was executed.
begin;
create table public.marketing_connections(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.marketing_teams(id),provider text not null default 'facebook' check(provider='facebook'),page_id text not null,page_name text not null,graph_version text not null,status text not null check(status in('not_connected','connected','missing_scope','needs_app_review','token_expired','unsupported','connection_error')),capabilities jsonb not null,verified_at timestamptz,expires_at timestamptz,confirmed_by uuid not null references public.profiles(id),version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(team_id,page_id));
create table marketing_private.publishing_credentials(connection_id uuid primary key references public.marketing_connections(id),credential_ciphertext text not null,verification_reference text not null);
create table public.marketing_publication_candidates(id uuid primary key default gen_random_uuid(),content_id uuid not null references public.marketing_content_items(id),campaign_id uuid not null references public.marketing_campaigns(id),team_id uuid not null references public.marketing_teams(id),creator_id uuid not null references public.profiles(id),connection_id uuid not null references public.marketing_connections(id),connection_version integer not null,content_version integer not null,design_id uuid references public.marketing_designs(id),mode text not null check(mode in('text','photo_dump','design')),final_asset_ids uuid[] not null,scheduled_for timestamptz not null,binding jsonb not null,status text not null default 'pending_verification' check(status in('pending_verification','sealed','approved','rejected')),snapshot jsonb,payload_hash text,reviewer_id uuid references public.profiles(id),reason text not null default '',version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
-- Authoritative current intent, serialized under its content row lock.
create table marketing_private.publishing_current_candidates(content_id uuid primary key references public.marketing_content_items(id),candidate_id uuid not null unique references public.marketing_publication_candidates(id));
revoke all on marketing_private.publishing_current_candidates from public,anon,authenticated,service_role;
create table public.marketing_publishing_jobs(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.marketing_teams(id),campaign_id uuid not null references public.marketing_campaigns(id),content_id uuid not null references public.marketing_content_items(id),candidate_id uuid not null unique references public.marketing_publication_candidates(id),approval_id uuid not null unique references public.marketing_approval_snapshots(id),connection_id uuid not null references public.marketing_connections(id),status text not null default 'queued' check(status in('queued','claimed','dispatching','remote_scheduled','published','cancelled','cancel_pending','unknown','failed','dead_letter')),scheduled_for timestamptz not null,idempotency_key text not null unique,attempts integer not null default 0,next_attempt_at timestamptz not null,lease_id uuid,lease_until timestamptz,remote_started_at timestamptz,cancel_requested_at timestamptz,remote_id text,receipt jsonb,last_error text,version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table marketing_private.publishing_attempts(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.marketing_publishing_jobs(id),lease_id uuid not null,worker_id text not null,action text not null,created_at timestamptz not null default now());
create table public.marketing_publishing_incidents(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.marketing_teams(id),campaign_id uuid not null references public.marketing_campaigns(id),content_id uuid references public.marketing_content_items(id),job_id uuid references public.marketing_publishing_jobs(id),kind text not null,severity text not null check(severity in('warning','critical')),message text not null,status text not null default 'open' check(status in('open','acknowledged','resolved')),dedupe_key text not null unique,actor_id uuid references public.profiles(id),version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.marketing_publishing_events(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.marketing_teams(id),entity_type text not null,entity_id uuid not null,action text not null,actor_id uuid references public.profiles(id),snapshot jsonb not null,created_at timestamptz not null default now());
create index marketing_jobs_due on public.marketing_publishing_jobs(status,next_attempt_at,scheduled_for);
do $$ declare t text;begin foreach t in array array['marketing_connections','marketing_publication_candidates','marketing_publishing_jobs','marketing_publishing_incidents','marketing_publishing_events'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select on public.%I to authenticated',t);execute format('create policy publishing_read on public.%I for select to authenticated using(marketing_private.can_read(team_id))',t);end loop;end $$;
revoke all on marketing_private.publishing_credentials,marketing_private.publishing_attempts from public,anon,authenticated,service_role;
create function marketing_private.publishing_actor(actor uuid,team uuid,manager boolean default false,admin_only boolean default false) returns void language plpgsql set search_path='' as $$ begin
 perform 1 from public.profiles where id=actor and status='active' for share;if not found then raise exception 'Active actor required' using errcode='42501';end if;
 perform 1 from public.user_roles where user_id=actor order by role for share;
 if not exists(select 1 from public.user_roles where user_id=actor and (role='Admin' or (not admin_only and role='PR Leader') or (not manager and not admin_only and role='PR Representative'))) then raise exception 'Role denied' using errcode='42501';end if;
 if not exists(select 1 from public.user_roles where user_id=actor and role='Admin') then perform 1 from public.marketing_team_memberships where team_id=team and user_id=actor for share;if not found then raise exception 'Team denied' using errcode='42501';end if;end if;
end $$;
create function marketing_private.publishing_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_op='DELETE' or tg_table_name='marketing_publishing_events' then raise exception 'Immutable publishing history' using errcode='42501';end if;
 if (to_jsonb(new)-array['status','snapshot','payload_hash','reviewer_id','reason','version','updated_at']) is distinct from (to_jsonb(old)-array['status','snapshot','payload_hash','reviewer_id','reason','version','updated_at']) or (old.snapshot is not null and (new.snapshot is distinct from old.snapshot or new.payload_hash is distinct from old.payload_hash)) then raise exception 'Immutable candidate' using errcode='42501';end if;return new;end $$;
create trigger publishing_candidate_guard before update or delete on public.marketing_publication_candidates for each row execute function marketing_private.publishing_guard();
create trigger publishing_event_guard before update or delete on public.marketing_publishing_events for each row execute function marketing_private.publishing_guard();
-- Lock the same live references for seal, approval and the immediate pre-dispatch gate.
create function marketing_private.publishing_refs(c public.marketing_publication_candidates,dispatch boolean default false) returns jsonb language plpgsql set search_path='' as $$
declare item public.marketing_content_items;cam public.marketing_campaigns;conn public.marketing_connections;d public.marketing_designs;a public.marketing_assets;k text;media jsonb:='[]';evidence jsonb:='[]';ev jsonb;current_evidence jsonb;begin
 select * into cam from public.marketing_campaigns where id=c.campaign_id for share;
 select * into item from public.marketing_content_items where id=c.content_id for update;
 select * into conn from public.marketing_connections where id=c.connection_id for share;
 if not exists(select 1 from marketing_private.publishing_current_candidates where content_id=c.content_id and candidate_id=c.id) then raise exception 'Superseded candidate' using errcode='22023';end if;
 if cam.status<>'active' or cam.version<>(c.binding->>'campaign_version')::int or item.team_id<>c.team_id or item.version<>c.content_version+(case when dispatch then 1 else 0 end) or item.publishing_status<>(case when dispatch then 'approved' else 'in_review' end) or conn.team_id<>c.team_id or conn.version<>c.connection_version or conn.status<>'connected' or conn.verified_at is null or (conn.expires_at is not null and conn.expires_at<=greatest(clock_timestamp(),c.scheduled_for)) then raise exception 'Stale or unavailable publication references' using errcode='22023';end if;
 if c.design_id is not null then select * into d from public.marketing_designs where id=c.design_id for share;if d.version<>(c.binding->>'design_version')::int or d.content_id<>c.content_id then raise exception 'Stale design' using errcode='22023';end if;end if;
 for k in select jsonb_object_keys(c.binding->'asset_versions') order by 1 loop
 select * into a from public.marketing_assets where id=k::uuid for share;
 if a.id is null or a.team_id<>c.team_id or (a.campaign_id is not null and a.campaign_id<>c.campaign_id) or a.version<>(c.binding->'asset_versions'->>k)::int or a.status<>'ready' or a.rights<>'approved' or not('facebook'=any(a.allowed_channels)) or (a.valid_until is not null and a.valid_until<=greatest(clock_timestamp(),c.scheduled_for)) then raise exception 'Stale image or rights' using errcode='22023';end if;
 if c.mode='design' and a.id=any(c.final_asset_ids) and (a.width<>(d.scene->>'width')::int or a.height<>(d.scene->>'height')::int) then raise exception 'Final dimensions mismatch' using errcode='22023';end if;
 media:=media||jsonb_build_array((to_jsonb(a)-'reported_sha256')||jsonb_build_object('roles',jsonb_build_object('source',(c.binding->'source_asset_ids') ? k,'final',a.id=any(c.final_asset_ids))));end loop;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into current_evidence from public.marketing_ideas x where x.content_id=c.content_id and x.status='selected';
 if current_evidence is distinct from c.binding->'evidence_refs' then raise exception 'Stale evidence references' using errcode='22023';end if;
 for ev in select i.evidence from public.marketing_ideas i where i.content_id=c.content_id and i.status='selected' order by i.id for share loop perform marketing_private.knowledge_evidence(c.team_id,ev);evidence:=evidence||jsonb_build_array(ev);end loop;
 return jsonb_build_object('evidence',evidence,'content',to_jsonb(item),'campaign',to_jsonb(cam),'connection',to_jsonb(conn),'design',case when d.id is null then null else to_jsonb(d) end,'media',media,'scheduled_for',c.scheduled_for,'mode',c.mode,'requester_id',c.creator_id,'final_asset_ids',c.final_asset_ids,'manual_preflight_warnings',jsonb_build_array('Human review of rights, caption and image rendering is required.'));
end $$;
create function marketing_private.publishing_incident(j public.marketing_publishing_jobs,kind text,message text) returns void language sql set search_path='' as $$ insert into public.marketing_publishing_incidents(team_id,campaign_id,content_id,job_id,kind,severity,message,dedupe_key) values(j.team_id,j.campaign_id,j.content_id,j.id,kind,'critical',message,j.id::text||':'||kind) on conflict(dedupe_key) do nothing $$;
create function marketing_private.publishing_content(id uuid,status text,actor uuid) returns void language plpgsql set search_path='' as $$ declare i public.marketing_content_items;begin
 update public.marketing_content_items set publishing_status=status,version=version+1,updated_at=clock_timestamp() where marketing_content_items.id=publishing_content.id and publishing_status is distinct from status returning * into i;
 if i.id is null then return;end if;
 insert into public.marketing_revisions(team_id,campaign_id,entity_type,entity_id,version,action,actor_id,snapshot) values(i.team_id,i.campaign_id,'content',i.id,i.version,'publishing_'||status,actor,to_jsonb(i));
 insert into public.marketing_audit_logs(team_id,entity_type,entity_id,version,action,actor_id,snapshot) values(i.team_id,'content',i.id,i.version,'publishing_'||status,actor,to_jsonb(i));end $$;
create function marketing_private.publishing_command(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare act text:=p_command->>'action';keys text[];k text;actor uuid:=auth.uid();c public.marketing_publication_candidates;i public.marketing_content_items;cam public.marketing_campaigns;conn public.marketing_connections;d public.marketing_designs;j public.marketing_publishing_jobs;inc public.marketing_publishing_incidents;finals uuid[];sources uuid[]:='{}';versions jsonb;aid uuid;approval uuid;result jsonb;begin
 if current_setting('role',true)<>'authenticated' then raise exception 'Authenticated session required' using errcode='42501';end if;
 keys:=case act when 'request_candidate' then array['action','content_id','expected_content_version','connection_id','mode','design_id','final_asset_ids','scheduled_for'] when 'approve_and_schedule' then array['action','id','expected_version','expected_hash','confirmed'] when 'reject_candidate' then array['action','id','expected_version','reason'] when 'cancel_job' then array['action','id','expected_version','reason'] when 'acknowledge_incident' then array['action','id','expected_version','reason'] when 'resolve_incident' then array['action','id','expected_version','reason'] end;
 perform marketing_private.publishing_validate(p_command,keys);
 if act='request_candidate' then
 select * into i from public.marketing_content_items where id=(p_command->>'content_id')::uuid;
 perform marketing_private.publishing_actor(actor,i.team_id);
 select * into cam from public.marketing_campaigns where id=i.campaign_id for share;
 select * into i from public.marketing_content_items where id=i.id for update;
 if i.id is null or i.version<>(p_command->>'expected_content_version')::int or i.publishing_status<>'in_review' then raise exception 'Content is stale or not in review' using errcode='22023';end if;
 select * into conn from public.marketing_connections where id=(p_command->>'connection_id')::uuid for share;
 if not coalesce(marketing_private.creative_timestamp(p_command->'scheduled_for'),false) or p_command->'scheduled_for'='null' or (p_command->>'scheduled_for')::timestamptz not between clock_timestamp()+interval '5 minutes' and clock_timestamp()+interval '30 days' then raise exception 'Invalid schedule' using errcode='22023';end if;
 if jsonb_typeof(p_command->'final_asset_ids')<>'array' or jsonb_array_length(p_command->'final_asset_ids')>10 then raise exception 'Invalid final media' using errcode='22023';end if;
 for k in select jsonb_array_elements_text(p_command->'final_asset_ids') loop if not marketing_private.creative_uuid(to_jsonb(k)) then raise exception 'Invalid asset ID' using errcode='22023';end if;end loop;
 select coalesce(array_agg(value::uuid),'{}') into finals from jsonb_array_elements_text(p_command->'final_asset_ids');
 if cardinality(finals)<>(select count(distinct x) from unnest(finals)x) then raise exception 'Duplicate finals' using errcode='22023';end if;
 if p_command->>'mode'='text' then if cardinality(finals)<>0 or p_command->'design_id'<>'null' then raise exception 'Text cannot have media' using errcode='22023';end if;
 elsif p_command->>'mode'='photo_dump' then if cardinality(finals)<1 or p_command->'design_id'<>'null' then raise exception 'Invalid photo dump' using errcode='22023';end if;sources:=finals;
 elsif p_command->>'mode'='design' then select * into d from public.marketing_designs where id=(p_command->>'design_id')::uuid for share;if d.id is null or d.content_id<>i.id or cardinality(finals)<>jsonb_array_length(d.scene->'pages') then raise exception 'Explicit current design and finals required' using errcode='22023';end if;select coalesce(array_agg(distinct (l->>'asset_id')::uuid),'{}') into sources from jsonb_array_elements(d.scene->'pages') p cross join lateral jsonb_array_elements(p->'layers') l where l->>'type'='image';
 else raise exception 'Invalid mode' using errcode='22023';end if;
 if (select count(distinct x) from unnest(sources||finals)x)>30 then raise exception 'Too many media' using errcode='22023';end if;
 perform 1 from public.marketing_assets where id=any(sources||finals) order by id for share;
 select coalesce(jsonb_object_agg(id::text,version),'{}') into versions from public.marketing_assets where id=any(sources||finals);
 if (select count(*) from jsonb_object_keys(versions))<>(select count(distinct x) from unnest(sources||finals)x) then raise exception 'Missing media' using errcode='22023';end if;
 insert into public.marketing_publication_candidates(content_id,campaign_id,team_id,creator_id,connection_id,connection_version,content_version,design_id,mode,final_asset_ids,scheduled_for,binding) values(i.id,i.campaign_id,i.team_id,actor,conn.id,conn.version,i.version,d.id,p_command->>'mode',finals,(p_command->>'scheduled_for')::timestamptz,jsonb_build_object('source_asset_ids',sources,'asset_versions',versions,'design_version',d.version,'campaign_version',cam.version,'evidence_refs',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.marketing_ideas x where x.content_id=i.id and x.status='selected'))) returning * into c;
 insert into marketing_private.publishing_current_candidates(content_id,candidate_id) values(c.content_id,c.id) on conflict(content_id) do update set candidate_id=excluded.candidate_id;
 perform marketing_private.publishing_refs(c);result:=to_jsonb(c);
 elsif act in('approve_and_schedule','reject_candidate') then
 select * into c from public.marketing_publication_candidates where id=(p_command->>'id')::uuid for update;perform marketing_private.publishing_actor(actor,c.team_id,true);
 if c.id is null or c.version<>(p_command->>'expected_version')::int then raise exception 'Stale candidate' using errcode='40001';end if;
 if c.status<>'sealed' then raise exception 'Sealed review required' using errcode='22023';end if;
 select * into i from public.marketing_content_items where id=c.content_id;
 if actor=i.creator_id then raise exception 'Content creator cannot review own content' using errcode='42501';end if;
 if act='approve_and_schedule' then
 if p_command->'confirmed' is distinct from 'true'::jsonb or p_command->>'expected_hash' is distinct from c.payload_hash or c.scheduled_for<=clock_timestamp() then raise exception 'Exact confirmed snapshot required' using errcode='22023';end if;
 perform marketing_private.publishing_refs(c);
 insert into public.marketing_approval_snapshots(team_id,content_id,creator_id,approver_id,content_version,snapshot) values(c.team_id,c.content_id,i.creator_id,actor,c.content_version,c.snapshot||jsonb_build_object('payload_hash',c.payload_hash,'candidate_id',c.id)) returning id into approval;
 insert into public.marketing_publishing_jobs(team_id,campaign_id,content_id,candidate_id,approval_id,connection_id,scheduled_for,idempotency_key,next_attempt_at) values(c.team_id,c.campaign_id,c.content_id,c.id,approval,c.connection_id,c.scheduled_for,'facebook:'||approval,c.scheduled_for);
 -- Keep approved content version bound: the status transition has its own revision, captured below.
 perform marketing_private.publishing_content(c.content_id,'approved',actor);
 update public.marketing_publication_candidates set status='approved',reviewer_id=actor,version=version+1,updated_at=clock_timestamp() where id=c.id returning * into c;
 else
 perform marketing_private.publishing_refs(c);
 update public.marketing_publication_candidates set status='rejected',reviewer_id=actor,reason=p_command->>'reason',version=version+1,updated_at=clock_timestamp() where id=c.id returning * into c;
 perform marketing_private.publishing_content(c.content_id,'changes_requested',actor);
 end if;result:=to_jsonb(c);
 elsif act='cancel_job' then
 select * into j from public.marketing_publishing_jobs where id=(p_command->>'id')::uuid for update;perform marketing_private.publishing_actor(actor,j.team_id,true);
 if j.id is null or j.version<>(p_command->>'expected_version')::int then raise exception 'Stale job' using errcode='40001';end if;
 if j.status='published' then raise exception 'Published content cannot be deleted' using errcode='22023';end if;
 update public.marketing_publishing_jobs set cancel_requested_at=coalesce(cancel_requested_at,clock_timestamp()),status=case when status in('queued','claimed') and remote_started_at is null then 'cancelled' when status in('cancelled','failed','dead_letter') then status else 'cancel_pending' end,last_error=p_command->>'reason',version=version+1,updated_at=clock_timestamp() where id=j.id returning * into j;
 if j.status='cancelled' then perform marketing_private.publishing_content(j.content_id,'changes_requested',(select reviewer_id from public.marketing_publication_candidates where id=j.candidate_id));end if;
 if j.status='cancel_pending' then perform marketing_private.publishing_incident(j,'cancel_pending','Remote cancellation requires verified reconciliation');end if;result:=to_jsonb(j);
 else
 select * into inc from public.marketing_publishing_incidents where id=(p_command->>'id')::uuid for update;perform marketing_private.publishing_actor(actor,inc.team_id,true);
 if inc.id is null or inc.version<>(p_command->>'expected_version')::int then raise exception 'Stale incident' using errcode='40001';end if;
 if act='resolve_incident' and exists(select 1 from public.marketing_publishing_jobs where id=inc.job_id and status in('dispatching','remote_scheduled','cancel_pending','unknown')) then raise exception 'Unresolved remote risk' using errcode='22023';end if;
 update public.marketing_publishing_incidents set status=case when act='resolve_incident' then 'resolved' else 'acknowledged' end,actor_id=actor,version=version+1,updated_at=clock_timestamp() where id=inc.id returning * into inc;result:=to_jsonb(inc);
 end if;
 insert into public.marketing_publishing_events(team_id,entity_type,entity_id,action,actor_id,snapshot) values((result->>'team_id')::uuid,'publishing',(result->>'id')::uuid,act,actor,result);return result;
end $$;
create function marketing_private.publishing_validate(v jsonb,keys text[]) returns void language plpgsql set search_path='' as $$ declare k text;begin
 if keys is null or octet_length(v::text)>262144 or not coalesce(marketing_private.creative_keys(v,keys),false) then raise exception 'Invalid command fields' using errcode='22023';end if;
 foreach k in array keys loop
 if k in('id','actor_id','team_id','content_id','connection_id','lease_id','design_id') and not(k='design_id' and v->k='null') and not coalesce(marketing_private.creative_uuid(v->k),false) then raise exception 'Invalid UUID' using errcode='22023';end if;
 if k in('expected_version','expected_content_version','lease_seconds') and (not coalesce(marketing_private.creative_number(v->k,1,2147483647),false) or (v->>k)::numeric<>trunc((v->>k)::numeric)) then raise exception 'Invalid integer' using errcode='22023';end if;
 if k='reason' and (jsonb_typeof(v->k)<>'string' or not marketing_private.knowledge_text(v->>k,2000,true)) then raise exception 'Invalid reason' using errcode='22023';end if;
 end loop;end $$;
create function marketing_private.publishing_gateway_command(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare act text:=p_command->>'action';keys text[];k text;c public.marketing_publication_candidates;conn public.marketing_connections;j public.marketing_publishing_jobs;a public.marketing_assets;m jsonb;refs jsonb;result jsonb;outcome text;begin
 -- role is set by PostgREST from its verified JWT, unlike user-supplied actor IDs.
 if current_setting('role',true)<>'service_role' then raise exception 'Service session required' using errcode='42501';end if;
 keys:=case act when 'seal_candidate' then array['action','id','expected_version','media'] when 'save_connection' then array['action','actor_id','team_id','page_id','page_name','graph_version','capabilities','verified_at','expires_at','credential_ciphertext','verification_reference'] when 'revoke_connection' then array['action','actor_id','id','expected_version','reason'] when 'read_credentials' then array['action','id'] when 'list_reconciliation' then array['action','limit'] when 'claim_job' then array['action','worker_id','lease_seconds'] when 'inspect_job' then array['action','id','lease_id'] when 'begin_dispatch' then array['action','id','lease_id'] when 'complete_job' then array['action','id','lease_id','outcome','remote_id','receipt','error'] when 'reconcile_job' then array['action','id','expected_version','outcome','remote_id','receipt'] when 'release_job' then array['action','id','lease_id','reason'] end;
 perform marketing_private.publishing_validate(p_command,keys);
 if act='save_connection' then
 perform marketing_private.publishing_actor((p_command->>'actor_id')::uuid,(p_command->>'team_id')::uuid,true,true);
 if p_command->>'page_id' !~ '^[0-9]{1,30}$' or not marketing_private.knowledge_text(p_command->>'page_name',180,true) or not marketing_private.knowledge_text(p_command->>'graph_version',40,true) or not marketing_private.knowledge_text(p_command->>'credential_ciphertext',16000,true) or not marketing_private.knowledge_text(p_command->>'verification_reference',500,true) or not coalesce(marketing_private.creative_timestamp(p_command->'verified_at'),false) or p_command->'verified_at'='null' or not coalesce(marketing_private.creative_timestamp(p_command->'expires_at'),false) or not coalesce(marketing_private.creative_keys(p_command->'capabilities',array['read_posts','read_comments','organic_metrics','upload_media','publish','schedule','cancel']),false) then raise exception 'Invalid connection' using errcode='22023';end if;
 for k in select jsonb_object_keys(p_command->'capabilities') loop if jsonb_typeof(p_command->'capabilities'->k)<>'boolean' then raise exception 'Invalid capability' using errcode='22023';end if;end loop;
 insert into public.marketing_connections(team_id,page_id,page_name,graph_version,status,capabilities,verified_at,expires_at,confirmed_by) values((p_command->>'team_id')::uuid,p_command->>'page_id',p_command->>'page_name',p_command->>'graph_version','connected',p_command->'capabilities',(p_command->>'verified_at')::timestamptz,(p_command->>'expires_at')::timestamptz,(p_command->>'actor_id')::uuid) on conflict(team_id,page_id) do update set page_name=excluded.page_name,graph_version=excluded.graph_version,status=excluded.status,capabilities=excluded.capabilities,verified_at=excluded.verified_at,expires_at=excluded.expires_at,confirmed_by=excluded.confirmed_by,version=marketing_connections.version+1,updated_at=clock_timestamp() returning * into conn;
 insert into marketing_private.publishing_credentials values(conn.id,p_command->>'credential_ciphertext',p_command->>'verification_reference') on conflict(connection_id) do update set credential_ciphertext=excluded.credential_ciphertext,verification_reference=excluded.verification_reference;return to_jsonb(conn);
 elsif act='revoke_connection' then
 select * into conn from public.marketing_connections where id=(p_command->>'id')::uuid for update;perform marketing_private.publishing_actor((p_command->>'actor_id')::uuid,conn.team_id,true,true);
 if conn.id is null or conn.version<>(p_command->>'expected_version')::int then raise exception 'Stale connection' using errcode='40001';end if;
 update public.marketing_connections set status='not_connected',version=version+1,updated_at=clock_timestamp() where id=conn.id returning * into conn;delete from marketing_private.publishing_credentials where connection_id=conn.id;return to_jsonb(conn);
 elsif act='read_credentials' then select jsonb_build_object('connection_id',connection_id,'credential_ciphertext',credential_ciphertext) into result from marketing_private.publishing_credentials where connection_id=(p_command->>'id')::uuid;return result;
 elsif act='seal_candidate' then
 select * into c from public.marketing_publication_candidates where id=(p_command->>'id')::uuid for update;
 if c.id is null or c.version<>(p_command->>'expected_version')::int then raise exception 'Stale candidate' using errcode='40001';end if;
 if c.status<>'pending_verification' then raise exception 'Candidate already sealed' using errcode='22023';end if;refs:=marketing_private.publishing_refs(c);
 if jsonb_typeof(p_command->'media')<>'array' or jsonb_array_length(p_command->'media')<>(select count(*) from jsonb_object_keys(c.binding->'asset_versions')) then raise exception 'Exact attestations required' using errcode='22023';end if;
 if (select count(distinct x->>'asset_id') from jsonb_array_elements(p_command->'media')x)<>jsonb_array_length(p_command->'media') then raise exception 'Duplicate attestation' using errcode='22023';end if;
 for m in select * from jsonb_array_elements(p_command->'media') loop
 if not coalesce(marketing_private.creative_keys(m,array['asset_id','asset_version','byte_size','sha256']),false) or not coalesce(marketing_private.creative_uuid(m->'asset_id'),false) or jsonb_typeof(m->'sha256')<>'string' or m->>'sha256' !~ '^[a-f0-9]{64}$' then raise exception 'Invalid attestation' using errcode='22023';end if;
 select * into a from public.marketing_assets where id=(m->>'asset_id')::uuid;
 if not(c.binding->'asset_versions' ? (m->>'asset_id')) or m->'asset_version' is distinct from to_jsonb(a.version) or m->'byte_size' is distinct from to_jsonb(a.byte_size) then raise exception 'Attestation binding mismatch' using errcode='22023';end if;end loop;
 refs:=(refs-'media')||jsonb_build_object('assets',refs->'media','media',p_command->'media');
 update public.marketing_publication_candidates set status='sealed',snapshot=refs,payload_hash=encode(sha256(convert_to(refs::text,'UTF8')),'hex'),version=version+1,updated_at=clock_timestamp() where id=c.id returning * into c;return to_jsonb(c);
 elsif act='list_reconciliation' then
 if not coalesce(marketing_private.creative_number(p_command->'limit',1,20),false) or (p_command->>'limit')::numeric<>trunc((p_command->>'limit')::numeric) then raise exception 'Invalid reconciliation limit' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select * from public.marketing_publishing_jobs where status in('unknown','cancel_pending','remote_scheduled') order by updated_at,id limit (p_command->>'limit')::int)x;return result;
 elsif act='claim_job' then
 if jsonb_typeof(p_command->'worker_id')<>'string' or not marketing_private.knowledge_text(p_command->>'worker_id',180,true) or (p_command->>'lease_seconds')::int not between 10 and 300 then raise exception 'Invalid worker lease' using errcode='22023';end if;
 for j in select * from public.marketing_publishing_jobs where status in('claimed','dispatching') and lease_until<clock_timestamp() order by id for update skip locked loop
 update public.marketing_publishing_jobs set status=case when remote_started_at is not null then 'unknown' when attempts>=3 then 'dead_letter' else 'queued' end,lease_id=null,lease_until=null,next_attempt_at=clock_timestamp()+interval '30 seconds',version=version+1,updated_at=clock_timestamp() where id=j.id returning * into j;
 if j.status='unknown' then perform marketing_private.publishing_incident(j,'unknown','Lease expired after possible remote write');end if;end loop;
 select * into j from public.marketing_publishing_jobs where status='queued' and attempts<3 and scheduled_for<=clock_timestamp() and next_attempt_at<=clock_timestamp() order by scheduled_for,id for update skip locked limit 1;
 if j.id is null then return null;end if;
 update public.marketing_publishing_jobs set status='claimed',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=clock_timestamp()+make_interval(secs=>(p_command->>'lease_seconds')::int),version=version+1,updated_at=clock_timestamp() where id=j.id returning * into j;
 insert into marketing_private.publishing_attempts(job_id,lease_id,worker_id,action) values(j.id,j.lease_id,p_command->>'worker_id','claimed');return to_jsonb(j);
 end if;
 select * into j from public.marketing_publishing_jobs where id=(p_command->>'id')::uuid for update;
 if j.id is null then raise exception 'Job unavailable' using errcode='22023';end if;
 select * into c from public.marketing_publication_candidates where id=j.candidate_id;
 if act='reconcile_job' then
 if j.version<>(p_command->>'expected_version')::int or j.status not in('unknown','cancel_pending','remote_scheduled') then raise exception 'Reconciliation state mismatch' using errcode='40001';end if;
 else
 if j.lease_id is distinct from (p_command->>'lease_id')::uuid or j.lease_until<=clock_timestamp() or j.status not in('claimed','dispatching','cancel_pending') then raise exception 'Lease mismatch' using errcode='42501';end if;
 end if;
 if act in('inspect_job','begin_dispatch') then
 if j.status<>'claimed' or j.remote_started_at is not null then raise exception 'Dispatch already started' using errcode='22023';end if;
 begin perform marketing_private.publishing_refs(c,true);exception when sqlstate '22023' then update public.marketing_publishing_jobs set status='cancelled',lease_id=null,lease_until=null,last_error='Current references block dispatch',version=version+1,updated_at=clock_timestamp() where id=j.id returning * into j;perform marketing_private.publishing_content(j.content_id,'changes_requested',c.reviewer_id);perform marketing_private.publishing_incident(j,'preflight','Current references block dispatch');return null;end;
 select * into conn from public.marketing_connections where id=j.connection_id;
 if conn.capabilities->'publish'<>'true' then raise exception 'Publishing capability unavailable' using errcode='22023';end if;
 if act='inspect_job' then return jsonb_build_object('job',to_jsonb(j),'candidate',to_jsonb(c),'connection',to_jsonb(conn));end if;
 update public.marketing_publishing_jobs set status='dispatching',remote_started_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=j.id returning * into j;
 insert into marketing_private.publishing_attempts(job_id,lease_id,worker_id,action) values(j.id,j.lease_id,'gateway','remote_started');return jsonb_build_object('job',to_jsonb(j),'candidate',to_jsonb(c),'connection',to_jsonb(conn));
 elsif act='release_job' then
 update public.marketing_publishing_jobs set status=case when remote_started_at is not null then 'unknown' when attempts>=3 then 'dead_letter' else 'queued' end,lease_id=null,lease_until=null,next_attempt_at=clock_timestamp()+make_interval(secs=>least(300,30*attempts)),last_error=p_command->>'reason',version=version+1,updated_at=clock_timestamp() where id=j.id returning * into j;
 else
 outcome:=p_command->>'outcome';
 if outcome not in('published','remote_scheduled','unknown','failed','cancel_pending','cancelled') or (act='complete_job' and outcome in('cancel_pending','cancelled')) or (act='complete_job' and j.remote_started_at is null) then raise exception 'Invalid outcome' using errcode='22023';end if;
 if j.remote_id is not null and p_command->>'remote_id' is not null and p_command->>'remote_id' is distinct from j.remote_id then raise exception 'Remote identity mismatch' using errcode='22023';end if;
 if p_command->'receipt' ? 'remote_id' and p_command->'receipt'->>'remote_id' is distinct from p_command->>'remote_id' then raise exception 'Receipt remote identity mismatch' using errcode='22023';end if;
 if p_command->'receipt' ? 'state' and p_command->'receipt'->>'state' is distinct from outcome then raise exception 'Receipt outcome mismatch' using errcode='22023';end if;
 if p_command->'receipt' ? 'status' and p_command->'receipt'->>'status' is distinct from outcome then raise exception 'Receipt outcome mismatch' using errcode='22023';end if;
 -- A service attestation of a provider response is required; no client receipt reaches here.
 if jsonb_typeof(p_command->'receipt')<>'object' or octet_length((p_command->'receipt')::text)>16384 then raise exception 'Invalid receipt' using errcode='22023';end if;
 for k in select jsonb_object_keys(p_command->'receipt') loop if jsonb_typeof(p_command->'receipt'->k) not in('string','boolean','null') or length((p_command->'receipt'->k)::text)>500 then raise exception 'Unsafe receipt value' using errcode='22023';end if;if k not in('verified','remote_id','status','provider','observed_at','request_id','cancelled','state','response_reference') then raise exception 'Unsafe receipt field' using errcode='22023';end if;end loop;
 if outcome in('published','remote_scheduled','cancelled') and p_command->'receipt'->'verified' is distinct from 'true'::jsonb then raise exception 'Verified receipt required' using errcode='22023';end if;
 if outcome in('published','remote_scheduled') and (jsonb_typeof(p_command->'remote_id')<>'string' or p_command->>'remote_id' !~ '^[A-Za-z0-9_-]{1,200}$') then raise exception 'Remote identity required' using errcode='22023';end if;
 if outcome='cancelled' and (j.remote_id is null or p_command->>'remote_id' is distinct from j.remote_id) then raise exception 'Known exact remote identity required for cancellation' using errcode='22023';end if;
 if outcome='cancelled' and p_command->'receipt'->'cancelled' is distinct from 'true'::jsonb and p_command->'receipt'->>'state' is distinct from 'cancelled' then raise exception 'Confirmed cancellation required' using errcode='22023';end if;
 if j.cancel_requested_at is not null and outcome in('remote_scheduled','failed') then outcome:='cancel_pending';end if;
 update public.marketing_publishing_jobs set status=outcome,remote_id=coalesce(p_command->>'remote_id',remote_id),receipt=p_command->'receipt',last_error=case when outcome in('unknown','failed') then 'Provider outcome requires attention' else null end,lease_id=null,lease_until=null,version=version+1,updated_at=clock_timestamp() where id=j.id returning * into j;
 if j.status='cancelled' then perform marketing_private.publishing_content(j.content_id,'changes_requested',c.reviewer_id);end if;
 if j.status in('published','remote_scheduled') then perform marketing_private.publishing_content(j.content_id,case when j.status='published' then 'published' else 'scheduled' end,c.reviewer_id);end if;
 end if;
 if j.status in('unknown','cancel_pending') then perform marketing_private.publishing_incident(j,j.status,'Remote outcome requires verified reconciliation');end if;return to_jsonb(j);
end $$;
create function marketing_private.publishing_invalidate() returns trigger language plpgsql set search_path='' as $$ declare j public.marketing_publishing_jobs;begin
 for j in select * from public.marketing_publishing_jobs jobs where jobs.status not in('published','cancelled','failed','dead_letter') and
 ((tg_table_name='marketing_campaigns' and jobs.campaign_id=new.id) or (tg_table_name='marketing_connections' and jobs.connection_id=new.id) or (tg_table_name='marketing_assets' and exists(select 1 from public.marketing_publication_candidates c where c.id=jobs.candidate_id and c.binding->'asset_versions' ? new.id::text))) order by jobs.id for update loop
 update public.marketing_publishing_jobs set cancel_requested_at=coalesce(cancel_requested_at,clock_timestamp()),status=case when status in('queued','claimed') and remote_started_at is null then 'cancelled' else 'cancel_pending' end,version=version+1,updated_at=clock_timestamp() where id=j.id returning * into j;
 if j.status='cancelled' then perform marketing_private.publishing_content(j.content_id,'changes_requested',(select reviewer_id from public.marketing_publication_candidates where id=j.candidate_id));end if;
 if j.status='cancel_pending' then perform marketing_private.publishing_incident(j,'reference_changed','Hold or revoked reference requires remote reconciliation');end if;end loop;return new;end $$;
create trigger publishing_campaign_hold after update of status on public.marketing_campaigns for each row when(new.status<>'active' and new.status is distinct from old.status) execute function marketing_private.publishing_invalidate();
create trigger publishing_asset_changed after update on public.marketing_assets for each row when(new.version<>old.version) execute function marketing_private.publishing_invalidate();
create trigger publishing_connection_changed after update on public.marketing_connections for each row when(new.version<>old.version) execute function marketing_private.publishing_invalidate();
create function public.marketing_publishing_command(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$ select marketing_private.publishing_command(p_command) $$;
create function public.marketing_publishing_gateway_command(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$ select marketing_private.publishing_gateway_command(p_command) $$;
revoke all on function public.marketing_publishing_command(jsonb),public.marketing_publishing_gateway_command(jsonb) from public,anon,authenticated,service_role;
do $$ declare f record;begin for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='marketing_private' and p.proname like 'publishing_%' loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);end loop;end $$;
grant usage on schema marketing_private to service_role;
grant execute on function public.marketing_publishing_command(jsonb),marketing_private.publishing_command(jsonb) to authenticated;
grant execute on function public.marketing_publishing_gateway_command(jsonb),marketing_private.publishing_gateway_command(jsonb) to service_role;
commit;
