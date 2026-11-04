-- Phase 1 only. Additive, no production identities/teams, OAuth, scheduler or publish path.
-- CLI unavailable in implementation environment: timestamped migration fallback per implementation plan.
begin;
create schema if not exists marketing_private;
revoke all on schema marketing_private from public, anon, authenticated, service_role;
grant usage on schema marketing_private to authenticated;
alter default privileges in schema marketing_private revoke execute on functions from public;

-- JavaScript validation measures UTF-16 code units; PostgreSQL length counts codepoints.
create function marketing_private.text_length(value text) returns integer
language sql immutable strict set search_path='' as $$
 select length(value)+regexp_count(value,U&'[\+010000-\+10FFFF]');
$$;

-- Match String.trim(), including tab/newline and the ECMAScript Unicode whitespace set.
create function marketing_private.trim_text(value text) returns text
language sql immutable strict set search_path='' as $$
 select btrim(value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;

create function marketing_private.valid_mix(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; total numeric:=0;
begin
  if jsonb_typeof(value) is distinct from 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(value))<>4 then return false; end if;
  foreach k in array array['ColorMAP','Sharing','Meme','InsideME'] loop
    if jsonb_typeof(value->k) is distinct from 'number' then return false; end if;
    if (value->>k)::numeric<0 or (value->>k)::numeric>100 then return false; end if;
    total:=total+(value->>k)::numeric;
  end loop;
  return total=100;
end $$;
create function marketing_private.valid_kpis(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb;
begin
  if jsonb_typeof(value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(value)>12 then return false; end if;
  for item in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(item))<>3 or not(item ?& array['name','target','unit']) then return false; end if;
    if jsonb_typeof(item->'name') is distinct from 'string' or marketing_private.text_length(item->>'name')>120 or length(marketing_private.trim_text(item->>'name'))=0
      or jsonb_typeof(item->'unit') is distinct from 'string' or marketing_private.text_length(item->>'unit')>40 or length(marketing_private.trim_text(item->>'unit'))=0 then return false; end if;
    if item->'target'<>'null'::jsonb and (jsonb_typeof(item->'target') is distinct from 'number') then return false; end if;
    if jsonb_typeof(item->'target')='number' and ((item->>'target')::numeric<0 or (item->>'target')::numeric>1000000000000) then return false; end if;
  end loop;
  return true;
end $$;

create table public.marketing_teams (
 id uuid primary key default gen_random_uuid(), name text not null check(length(marketing_private.trim_text(name))>0 and marketing_private.text_length(name)<=120),
 creator_id uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.marketing_team_memberships (
 team_id uuid not null references public.marketing_teams(id), user_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), primary key(team_id,user_id)
);
create index marketing_memberships_user_idx on public.marketing_team_memberships(user_id,team_id);
create table public.marketing_campaigns (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.marketing_teams(id),
 name text not null check(length(marketing_private.trim_text(name))>0 and marketing_private.text_length(name)<=180), kind text not null check(kind in('seasonal','always_on')),
 status text not null default 'draft' check(status in('draft','pending_activation','active','paused','emergency_hold','completed','archived')),
 objective text not null default '' check(marketing_private.text_length(objective)<=5000), audience text not null default '' check(marketing_private.text_length(audience)<=5000),
 message text not null default '' check(marketing_private.text_length(message)<=5000), start_date date check(start_date is null or isfinite(start_date)), end_date date check(end_date is null or isfinite(end_date)),
 creator_id uuid not null references public.profiles(id),
 content_mix jsonb not null default '{"ColorMAP":25,"Sharing":25,"Meme":25,"InsideME":25}' check(marketing_private.valid_mix(content_mix)),
 plan text not null default '' check(marketing_private.text_length(plan)<=50000), kpi_draft jsonb not null default '[]' check(marketing_private.valid_kpis(kpi_draft)),
 official_kpis jsonb check(official_kpis is null or marketing_private.valid_kpis(official_kpis)),
 activated_by uuid references public.profiles(id), activated_at timestamptz, hold_reason text,
 version integer not null default 1 check(version>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,team_id), check(end_date is null or start_date is null or end_date>=start_date),
 check((official_kpis is null and activated_by is null and activated_at is null) or
       (official_kpis is not null and activated_by is not null and activated_at is not null)),
 check(status not in('active','paused','emergency_hold','completed') or official_kpis is not null)
);
create index marketing_campaigns_team_idx on public.marketing_campaigns(team_id,status);
create table public.marketing_content_items (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null, team_id uuid not null,
 creator_id uuid not null references public.profiles(id), assignee_id uuid references public.profiles(id),
 title text not null check(length(marketing_private.trim_text(title))>0 and marketing_private.text_length(title)<=180), caption text not null default '' check(marketing_private.text_length(caption)<=12000),
 content_line text not null check(content_line in('ColorMAP','Sharing','Meme','InsideME')),
 production_status text not null default 'not_started' check(production_status in('not_started','writing','designing','editing','ready')),
 publishing_status text not null default 'draft' check(publishing_status in('draft','in_review','changes_requested','approved','scheduled','published','failed','cancelled')),
 production_due_at timestamptz check(production_due_at is null or isfinite(production_due_at)), review_due_at timestamptz check(review_due_at is null or isfinite(review_due_at)), proposed_publish_at timestamptz check(proposed_publish_at is null or isfinite(proposed_publish_at)),
 version integer not null default 1 check(version>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(campaign_id,team_id) references public.marketing_campaigns(id,team_id)
);
create index marketing_content_campaign_idx on public.marketing_content_items(campaign_id);
create index marketing_content_calendar_idx on public.marketing_content_items(team_id,proposed_publish_at);
create table public.marketing_revisions (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.marketing_teams(id),
 campaign_id uuid not null references public.marketing_campaigns(id), entity_type text not null check(entity_type in('campaign','content')),
 entity_id uuid not null, version integer not null check(version>0), action text not null,
 actor_id uuid not null references public.profiles(id), snapshot jsonb not null, created_at timestamptz not null default now(),
 unique(entity_type,entity_id,version)
);
create index marketing_revisions_team_idx on public.marketing_revisions(team_id,campaign_id,created_at);
create table public.marketing_audit_logs (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.marketing_teams(id),
 entity_type text not null, entity_id uuid not null, version integer, action text not null,
 actor_id uuid not null references public.profiles(id), snapshot jsonb not null, created_at timestamptz not null default now()
);
create index marketing_audit_team_idx on public.marketing_audit_logs(team_id,created_at);
-- Reserved future artifact. No Phase 1 command can insert an approval or schedule content.
create table public.marketing_approval_snapshots (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.marketing_teams(id),
 content_id uuid not null references public.marketing_content_items(id), creator_id uuid not null references public.profiles(id),
 approver_id uuid not null references public.profiles(id), content_version integer not null check(content_version>0),
 snapshot jsonb not null, created_at timestamptz not null default now(), check(creator_id<>approver_id)
);

create function marketing_private.guard_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name in('marketing_revisions','marketing_audit_logs','marketing_approval_snapshots') then
   raise exception 'History is immutable' using errcode='42501';
 end if;
 if new.creator_id<>old.creator_id or new.team_id<>old.team_id or new.created_at<>old.created_at then
   raise exception 'Creator and scope are immutable' using errcode='42501';
 end if;
 if tg_table_name='marketing_campaigns' and to_jsonb(old)->'official_kpis'<>'null'::jsonb then
   if to_jsonb(new)->'official_kpis' is distinct from to_jsonb(old)->'official_kpis'
    or to_jsonb(new)->'activated_by' is distinct from to_jsonb(old)->'activated_by'
    or to_jsonb(new)->'activated_at' is distinct from to_jsonb(old)->'activated_at' then
     raise exception 'Official KPI snapshot is immutable' using errcode='42501';
   end if;
 end if;
 if tg_table_name='marketing_content_items' and to_jsonb(new)->'campaign_id'<>to_jsonb(old)->'campaign_id' then
   raise exception 'Campaign is immutable' using errcode='42501';
 end if;
 return new;
end $$;
create trigger marketing_campaign_immutable before update on public.marketing_campaigns for each row execute function marketing_private.guard_immutable();
create trigger marketing_content_immutable before update on public.marketing_content_items for each row execute function marketing_private.guard_immutable();
create trigger marketing_revision_immutable before update or delete on public.marketing_revisions for each row execute function marketing_private.guard_immutable();
create trigger marketing_audit_immutable before update or delete on public.marketing_audit_logs for each row execute function marketing_private.guard_immutable();
create trigger marketing_approval_immutable before update or delete on public.marketing_approval_snapshots for each row execute function marketing_private.guard_immutable();

create function marketing_private.can_read(p_team uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active')
 and exists(select 1 from public.user_roles r where r.user_id=auth.uid())
 and (exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='Admin')
 or exists(select 1 from public.marketing_team_memberships m where m.team_id=p_team and m.user_id=auth.uid()));
$$;

do $$ declare t text; begin
 foreach t in array array['marketing_teams','marketing_team_memberships','marketing_campaigns','marketing_content_items','marketing_revisions','marketing_audit_logs','marketing_approval_snapshots'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on table public.%I to authenticated',t);
  execute format('create policy marketing_team_read on public.%I for select to authenticated using (marketing_private.can_read(%I))',t,case when t='marketing_teams' then 'id' else 'team_id' end);
 end loop;
end $$;

create function marketing_private.command(p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); action text:=p_command->>'action'; admin boolean; manager boolean; writer boolean;
 allowed text[]; field text; team uuid; target uuid; assignee uuid; c public.marketing_campaigns%rowtype;
 item public.marketing_content_items%rowtype; result jsonb; entity text; entity_id uuid; campaign uuid; revision integer;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 -- Hold these locks through commit: status/role/membership revocation serializes with writes.
 perform 1 from public.profiles where id=actor and status='active' for share;
 if not found then raise exception 'Active account required' using errcode='42501'; end if;
 perform 1 from public.user_roles where user_id=actor order by role for share;
 select exists(select 1 from public.user_roles where user_id=actor and role='Admin'),
        exists(select 1 from public.user_roles where user_id=actor and role in('Admin','PR Leader')),
        exists(select 1 from public.user_roles where user_id=actor and role in('Admin','PR Leader','PR Representative'))
 into admin,manager,writer;
 if not writer then raise exception 'Write permission required' using errcode='42501'; end if;
 if jsonb_typeof(p_command) is distinct from 'object' then raise exception 'Invalid command' using errcode='22023'; end if;
 allowed:=case action
 when 'create_team' then array['action','name']
 when 'set_member' then array['action','team_id','user_id','enabled']
 when 'create_campaign' then array['action','team_id','name','kind','objective','audience','message','start_date','end_date']
 when 'update_campaign' then array['action','id','expected_version','name','kind','objective','audience','message','start_date','end_date']
 when 'update_plan' then array['action','id','expected_version','content_mix','plan','kpi_draft']
 when 'create_content' then array['action','campaign_id','title','caption','content_line','assignee_id','production_status','production_due_at','review_due_at','proposed_publish_at']
 when 'update_content' then array['action','id','expected_version','title','caption','content_line','assignee_id','production_status','production_due_at','review_due_at','proposed_publish_at']
 when 'submit_review' then array['action','id','expected_version']
 when 'request_changes' then array['action','id','expected_version','reason']
 when 'emergency_hold' then array['action','id','expected_version','reason']
 when 'submit_activation' then array['action','id','expected_version']
 when 'activate_campaign' then array['action','id','expected_version']
 when 'pause_campaign' then array['action','id','expected_version']
 when 'resume_campaign' then array['action','id','expected_version']
 when 'complete_campaign' then array['action','id','expected_version']
 when 'archive_campaign' then array['action','id','expected_version'] end;
 if allowed is null or exists(select 1 from jsonb_object_keys(p_command) k where not(k=any(allowed))) then
   raise exception 'Unsupported command or field' using errcode='22023';
 end if;
 if not(p_command ?& allowed) then raise exception 'Required fields must be explicit, including nullable fields' using errcode='22023'; end if;
 -- RPC callers receive the same primitive contract as the HTTP validator.
 if octet_length(p_command::text)>1000000 then raise exception 'Command too large' using errcode='22023'; end if;
 foreach field in array array['action','name','kind','objective','audience','message','plan','title','caption','content_line','production_status','reason','team_id','user_id','campaign_id','id','assignee_id','start_date','end_date','production_due_at','review_due_at','proposed_publish_at'] loop
  if p_command ? field and p_command->field<>'null'::jsonb and jsonb_typeof(p_command->field)<>'string' then
   raise exception 'Expected text field: %',field using errcode='22023';
  end if;
 end loop;
 -- Parse the exact public command syntax; PostgreSQL's permissive date/time casts
 -- otherwise accept locale dates, missing offsets and normalized 24:00 timestamps.
 foreach field in array array['action','name','kind','objective','audience','message','plan','title','caption','content_line','production_status','reason','team_id','user_id','campaign_id','id'] loop
  if p_command ? field and p_command->field='null'::jsonb then raise exception 'Non-null field required: %',field using errcode='22023'; end if;
 end loop;
 foreach field in array array['team_id','user_id','campaign_id','id','assignee_id'] loop
  if p_command ? field and p_command->field<>'null'::jsonb and (p_command->>field)!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
   raise exception 'Invalid UUID field: %',field using errcode='22023';
  end if;
 end loop;
 foreach field in array array['start_date','end_date'] loop
  if p_command ? field and p_command->field<>'null'::jsonb then
   if (p_command->>field)!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Expected YYYY-MM-DD date' using errcode='22023'; end if;
   begin perform (p_command->>field)::date;
   exception when datetime_field_overflow or invalid_datetime_format then raise exception 'Invalid calendar date' using errcode='22023'; end;
  end if;
 end loop;
 foreach field in array array['production_due_at','review_due_at','proposed_publish_at'] loop
  if p_command ? field and p_command->field<>'null'::jsonb then
   if (p_command->>field)!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?(Z|[+-][0-9]{2}:[0-9]{2})$'
    or substring(p_command->>field from 12 for 2)::integer>23 or substring(p_command->>field from 15 for 2)::integer>59
    or (substring(p_command->>field from 17 for 1)=':' and substring(p_command->>field from 18 for 2)::integer>59) then
    raise exception 'Expected valid timestamp with explicit timezone' using errcode='22023';
   end if;
   begin perform (p_command->>field)::timestamptz;
   exception when datetime_field_overflow or invalid_datetime_format then raise exception 'Invalid timestamp' using errcode='22023'; end;
  end if;
 end loop;
 if p_command ? 'expected_version' and (jsonb_typeof(p_command->'expected_version') is distinct from 'number'
  or (p_command->>'expected_version')::numeric<1 or (p_command->>'expected_version')::numeric>9007199254740991
  or (p_command->>'expected_version')::numeric<>trunc((p_command->>'expected_version')::numeric)) then
  raise exception 'Expected positive safe integer version' using errcode='22023';
 end if;
 foreach field in array array['name','objective','audience','message','plan','title','caption','reason'] loop
  if p_command ? field then
   if marketing_private.text_length(p_command->>field)>(case field when 'name' then case when action='create_team' then 120 else 180 end when 'title' then 180 when 'plan' then 50000 when 'caption' then 12000 when 'reason' then 2000 else 5000 end) then
    raise exception 'Text field too long: %',field using errcode='22023';
   end if;
   p_command:=jsonb_set(p_command,array[field],to_jsonb(marketing_private.trim_text(p_command->>field)));
  end if;
 end loop;
 if p_command ? 'kpi_draft' then
  if not marketing_private.valid_kpis(p_command->'kpi_draft') then raise exception 'Invalid KPI draft' using errcode='22023'; end if;
  p_command:=jsonb_set(p_command,'{kpi_draft}',coalesce((select jsonb_agg(entry || jsonb_build_object('name',marketing_private.trim_text(entry->>'name'),'unit',marketing_private.trim_text(entry->>'unit'))) from jsonb_array_elements(p_command->'kpi_draft') entry),'[]'::jsonb));
 end if;
 if action='create_team' then
  if not admin then raise exception 'Admin required' using errcode='42501'; end if;
  insert into public.marketing_teams(name,creator_id) values(p_command->>'name',actor) returning to_jsonb(marketing_teams.*) into result;
  team:=(result->>'id')::uuid; entity:='team'; entity_id:=team;
 elsif action='set_member' then
  if not admin then raise exception 'Admin required' using errcode='42501'; end if;
  team:=(p_command->>'team_id')::uuid; target:=(p_command->>'user_id')::uuid;
  perform 1 from public.marketing_teams where id=team for share;
  if not found then raise exception 'Team not found' using errcode='22023'; end if;
  if jsonb_typeof(p_command->'enabled') is distinct from 'boolean' then raise exception 'Enabled must be boolean' using errcode='22023'; end if;
  if (p_command->>'enabled')::boolean then
   perform 1 from public.profiles where id=target and status='active' for share;
   if not found then raise exception 'Active member required' using errcode='22023'; end if;
   perform 1 from public.user_roles where user_id=target order by role for share;
   if not found then raise exception 'Member role required' using errcode='22023'; end if;
   insert into public.marketing_team_memberships(team_id,user_id) values(team,target) on conflict do nothing;
  else delete from public.marketing_team_memberships where team_id=team and user_id=target;
  end if;
  result:=jsonb_build_object('team_id',team,'user_id',target,'enabled',(p_command->>'enabled')::boolean);
  entity:='membership'; entity_id:=target;
 else
  if action='create_campaign' then team:=(p_command->>'team_id')::uuid;
  elsif action='create_content' then
   select * into c from public.marketing_campaigns where id=(p_command->>'campaign_id')::uuid for update;
   team:=c.team_id;
  elsif action in('update_content','submit_review','request_changes') then
   -- Always campaign before content so all operations share a consistent lock order.
   select * into item from public.marketing_content_items where id=(p_command->>'id')::uuid;
   select * into c from public.marketing_campaigns where id=item.campaign_id for update;
   select * into item from public.marketing_content_items where id=(p_command->>'id')::uuid for update;
   team:=item.team_id;
  else
   select * into c from public.marketing_campaigns where id=(p_command->>'id')::uuid for update;
   team:=c.team_id;
  end if;
  if team is null then raise exception 'Entity unavailable' using errcode='42501'; end if;
  perform 1 from public.marketing_teams where id=team for share;
  if not found then raise exception 'Team unavailable' using errcode='42501'; end if;
  if not admin then
   perform 1 from public.marketing_team_memberships where team_id=team and user_id=actor for share;
   if not found then raise exception 'Team membership required' using errcode='42501'; end if;
  end if;
  if action not in('create_campaign','create_content') then
   if jsonb_typeof(p_command->'expected_version') is distinct from 'number' then raise exception 'Expected version required' using errcode='22023'; end if;
   if (p_command->>'expected_version')::numeric<>(case when action in('update_content','submit_review','request_changes') then item.version else c.version end) then
    raise exception 'Version conflict' using errcode='40001';
   end if;
  end if;
  if action='create_campaign' then
   insert into public.marketing_campaigns(team_id,name,kind,objective,audience,message,start_date,end_date,creator_id)
   values(team,p_command->>'name',p_command->>'kind',coalesce(p_command->>'objective',''),coalesce(p_command->>'audience',''),coalesce(p_command->>'message',''),(p_command->>'start_date')::date,(p_command->>'end_date')::date,actor) returning * into c;
  elsif action='update_campaign' then
   if c.status<>'draft' then raise exception 'Only draft campaign details can change' using errcode='22023'; end if;
   update public.marketing_campaigns set name=p_command->>'name',kind=p_command->>'kind',objective=coalesce(p_command->>'objective',''),audience=coalesce(p_command->>'audience',''),message=coalesce(p_command->>'message',''),start_date=(p_command->>'start_date')::date,end_date=(p_command->>'end_date')::date,version=version+1,updated_at=now() where id=c.id returning * into c;
  elsif action='update_plan' then
   if c.status not in('draft','active') then raise exception 'Campaign plan is frozen in this state' using errcode='22023'; end if;
   if c.official_kpis is not null and p_command->'kpi_draft' is distinct from c.official_kpis then raise exception 'Official KPI change requires future review workflow' using errcode='42501'; end if;
   update public.marketing_campaigns set content_mix=p_command->'content_mix',plan=p_command->>'plan',kpi_draft=p_command->'kpi_draft',version=version+1,updated_at=now() where id=c.id returning * into c;
  elsif action in('create_content','update_content','submit_review','request_changes') then
   if c.status not in('draft','active') then raise exception 'Content changes unavailable in this campaign state' using errcode='22023'; end if;
   if action in('create_content','update_content') then
    assignee:=(p_command->>'assignee_id')::uuid;
    if assignee is not null then
     perform 1 from public.profiles where id=assignee and status='active' for share;
     if not found then raise exception 'Assignee must be active team member' using errcode='22023'; end if;
     perform 1 from public.user_roles where user_id=assignee order by role for share;
     if not found then raise exception 'Assignee role required' using errcode='22023'; end if;
     perform 1 from public.marketing_team_memberships where team_id=team and user_id=assignee for share;
     if not found then raise exception 'Assignee must be active team member' using errcode='22023'; end if;
    end if;
    if action='create_content' then
     insert into public.marketing_content_items(campaign_id,team_id,creator_id,assignee_id,title,caption,content_line,production_status,production_due_at,review_due_at,proposed_publish_at)
     values(c.id,team,actor,assignee,p_command->>'title',coalesce(p_command->>'caption',''),p_command->>'content_line',p_command->>'production_status',(p_command->>'production_due_at')::timestamptz,(p_command->>'review_due_at')::timestamptz,(p_command->>'proposed_publish_at')::timestamptz) returning * into item;
    else
     if item.publishing_status not in('draft','in_review','changes_requested') then raise exception 'Content is frozen' using errcode='42501'; end if;
     update public.marketing_content_items set assignee_id=assignee,title=p_command->>'title',caption=coalesce(p_command->>'caption',''),content_line=p_command->>'content_line',production_status=p_command->>'production_status',production_due_at=(p_command->>'production_due_at')::timestamptz,review_due_at=(p_command->>'review_due_at')::timestamptz,proposed_publish_at=(p_command->>'proposed_publish_at')::timestamptz,publishing_status='draft',version=version+1,updated_at=now() where id=item.id returning * into item;
    end if;
   elsif action='submit_review' then
    if item.publishing_status not in('draft','changes_requested') then raise exception 'Invalid review transition' using errcode='22023'; end if;
    update public.marketing_content_items set publishing_status='in_review',version=version+1,updated_at=now() where id=item.id returning * into item;
   else
    if not manager then raise exception 'Manager required' using errcode='42501'; end if;
    if item.publishing_status<>'in_review' or length(marketing_private.trim_text(coalesce(p_command->>'reason','')))=0 then raise exception 'Review and reason required' using errcode='22023'; end if;
    update public.marketing_content_items set publishing_status='changes_requested',version=version+1,updated_at=now() where id=item.id returning * into item;
   end if;
   entity:='content'; entity_id:=item.id; campaign:=item.campaign_id; revision:=item.version; result:=to_jsonb(item);
  else
   if action in('activate_campaign','pause_campaign','resume_campaign','complete_campaign','archive_campaign') and not manager then raise exception 'Manager required' using errcode='42501'; end if;
   if action='submit_activation' and c.status='draft' then c.status:='pending_activation';
   elsif action='activate_campaign' and c.status='pending_activation' then
    c.status:='active'; c.official_kpis:=c.kpi_draft; c.activated_by:=actor; c.activated_at:=now();
   elsif action='pause_campaign' and c.status='active' then c.status:='paused';
   elsif action='emergency_hold' and c.status='active' then
    if length(marketing_private.trim_text(coalesce(p_command->>'reason',''))) not between 1 and 2000 then raise exception 'Hold reason required' using errcode='22023'; end if;
    c.status:='emergency_hold'; c.hold_reason:=p_command->>'reason';
   elsif action='resume_campaign' and c.status in('paused','emergency_hold') then c.status:='active'; c.hold_reason:=null;
   elsif action='complete_campaign' and c.status in('active','paused') then c.status:='completed';
   elsif action='archive_campaign' and c.status in('draft','completed') then c.status:='archived';
   else raise exception 'Invalid campaign transition' using errcode='22023'; end if;
   update public.marketing_campaigns set status=c.status,official_kpis=c.official_kpis,activated_by=c.activated_by,activated_at=c.activated_at,hold_reason=c.hold_reason,version=version+1,updated_at=now() where id=c.id returning * into c;
   -- Resume deliberately touches only campaign; content schedules/statuses are unchanged.
  end if;
  if entity is null then entity:='campaign'; entity_id:=c.id; campaign:=c.id; revision:=c.version; result:=to_jsonb(c); end if;
  insert into public.marketing_revisions(team_id,campaign_id,entity_type,entity_id,version,action,actor_id,snapshot)
   values(team,campaign,entity,entity_id,revision,action,actor,result);
 end if;
 insert into public.marketing_audit_logs(team_id,entity_type,entity_id,version,action,actor_id,snapshot)
 values(team,entity,entity_id,revision,action,actor,jsonb_build_object('row',result,'reason',p_command->>'reason'));
 return result;
end $$;

create function public.marketing_command(p_command jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select marketing_private.command(p_command); $$;
revoke all on all functions in schema marketing_private from public,anon,authenticated,service_role;
grant execute on function marketing_private.can_read(uuid),marketing_private.command(jsonb) to authenticated;
revoke all on function public.marketing_command(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.marketing_command(jsonb) to authenticated;
comment on function public.marketing_command(jsonb) is 'Phase 1 transactional commands. User JWT identity, live DB role/status/membership and optimistic version checks. No publishing or approval action.';
commit;
