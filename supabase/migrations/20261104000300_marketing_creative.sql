-- Additive Phase 3. CLI unavailable: timestamped migration created locally; never remotely applied.
begin;
create function marketing_private.creative_keys(v jsonb,keys text[]) returns boolean language sql immutable set search_path='' as $$ select jsonb_typeof(v)='object' and v ?& keys and (select count(*) from jsonb_object_keys(v))=cardinality(keys) $$;
create function marketing_private.creative_uuid(v jsonb) returns boolean language sql immutable set search_path='' as $$ select jsonb_typeof(v)='string' and v#>>'{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' $$;
create function marketing_private.creative_number(v jsonb,lo numeric,hi numeric) returns boolean language sql immutable set search_path='' as $$ select case when jsonb_typeof(v)='number' then (v#>>'{}')::numeric between lo and hi else false end $$;
create function marketing_private.creative_scene(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare p jsonb;l jsonb;ids text[]:='{}';k text;base text[]:=array['id','x','y','width','height','rotation','opacity','locked','type'];extra text[];
begin
 if not coalesce(marketing_private.creative_keys(v,array['schema_version','width','height','format','pages']),false) or v->'schema_version'<>'1'::jsonb or v->'width'<>'1080'::jsonb or v->'height' not in('1080'::jsonb,'1350'::jsonb,'1920'::jsonb) or jsonb_typeof(v->'format')<>'string' or v->>'format' not in('graphic_carousel','photo_dump','hybrid') or jsonb_typeof(v->'pages')<>'array' then return false;end if;
 if jsonb_array_length(v->'pages') not between 1 and 10 then return false;end if;
 for p in select * from jsonb_array_elements(v->'pages') loop
 if not marketing_private.creative_keys(p,array['id','background','layers']) or not marketing_private.creative_uuid(p->'id') or lower(p->>'id')=any(ids) or jsonb_typeof(p->'background')<>'string' or p->>'background' !~ '^#[0-9a-fA-F]{6}$' or jsonb_typeof(p->'layers')<>'array' then return false;end if;
 ids:=array_append(ids,lower(p->>'id'));if jsonb_array_length(p->'layers')>40 then return false;end if;
 for l in select * from jsonb_array_elements(p->'layers') loop
 extra:=case l->>'type' when 'text' then array['text','font_size','font_family','fill','align'] when 'shape' then array['fill','radius'] when 'image' then array['asset_id','fit','role'] end;
 if extra is null or not marketing_private.creative_keys(l,base||extra) or not marketing_private.creative_uuid(l->'id') or lower(l->>'id')=any(ids) or jsonb_typeof(l->'locked')<>'boolean' then return false;end if;
 ids:=array_append(ids,lower(l->>'id'));
 foreach k in array array['x','y','width','height','rotation','opacity'] loop
 if not marketing_private.creative_number(l->k,case when k in('x','y') then -12000 when k in('width','height') then 1 when k='rotation' then -180 else 0 end,case when k='rotation' then 180 when k='opacity' then 1 else 12000 end) then return false;end if;end loop;
 if l->>'type' in('text','shape') and (jsonb_typeof(l->'fill')<>'string' or l->>'fill' !~ '^#[0-9a-fA-F]{6}$') then return false;end if;
 if l->>'type'='text' and (jsonb_typeof(l->'text')<>'string' or marketing_private.text_length(l->>'text')>2000 or not marketing_private.creative_number(l->'font_size',12,240) or jsonb_typeof(l->'font_family')<>'string' or jsonb_typeof(l->'align')<>'string' or l->>'font_family' not in('Arial','Georgia','system-ui') or l->>'align' not in('left','center','right')) then return false;end if;
 if l->>'type'='shape' and not marketing_private.creative_number(l->'radius',0,500) then return false;end if;
 if l->>'type'='image' and (not marketing_private.creative_uuid(l->'asset_id') or jsonb_typeof(l->'fit')<>'string' or jsonb_typeof(l->'role')<>'string' or l->>'fit' not in('contain','cover') or l->>'role' not in('photo','logo') or (l->>'role'='logo' and l->>'fit'<>'contain')) then return false;end if;
 end loop;end loop;return true;
exception when others then return false;
end $$;
create function marketing_private.creative_timestamp(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare x text:=v#>>'{}';stamp timestamptz;
begin
 if v='null'::jsonb then return true;end if;
 if jsonb_typeof(v)<>'string' or x !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?(Z|[+-][0-9]{2}:[0-9]{2})$' or substring(x from 12 for 2)::integer>23 or substring(x from 15 for 2)::integer>59 or (substring(x from 17 for 1)=':' and substring(x from 18 for 2)::integer>59) then return false;end if;
 stamp:=x::timestamptz;return isfinite(stamp) and extract(year from stamp at time zone 'UTC') between 1000 and 9999;
exception when others then return false;
end $$;
create table public.marketing_assets(
 id uuid primary key default gen_random_uuid(),team_id uuid not null references public.marketing_teams(id),campaign_id uuid,
 title text not null check(marketing_private.knowledge_text(title,180,true)),filename text not null check(marketing_private.knowledge_text(filename,255,true)),mime_type text not null check(mime_type in('image/png','image/jpeg')),
 byte_size integer not null check(byte_size between 1 and 8388608),width integer not null check(width between 16 and 12000),height integer not null check(height between 16 and 12000),check(width::bigint*height<=40000000),reported_sha256 text not null check(reported_sha256 ~ '^[a-f0-9]{64}$'),storage_path text not null unique,
 status text not null default 'pending_upload' check(status in('pending_upload','ready')),provenance text not null check(marketing_private.knowledge_text(provenance,2000)),author text not null check(marketing_private.knowledge_text(author,200)),event text not null check(marketing_private.knowledge_text(event,200)),tags text[] not null,
 rights text not null default 'needs_review' check(rights in('needs_review','approved','internal_only','revoked')),rights_reason text not null default '',allowed_channels text[] not null default '{}',valid_until timestamptz check(valid_until is null or isfinite(valid_until)),creator_id uuid not null references public.profiles(id),reviewer_id uuid references public.profiles(id),reviewed_at timestamptz,version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(campaign_id,team_id) references public.marketing_campaigns(id,team_id)
);
create table public.marketing_designs(
 id uuid primary key default gen_random_uuid(),content_id uuid not null references public.marketing_content_items(id),campaign_id uuid not null,team_id uuid not null,title text not null check(marketing_private.knowledge_text(title,180,true)),scene jsonb not null check(marketing_private.creative_scene(scene)),is_default boolean not null,parent_design_id uuid references public.marketing_designs(id),creator_id uuid not null references public.profiles(id),version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(campaign_id,team_id) references public.marketing_campaigns(id,team_id));
create unique index marketing_default_design on public.marketing_designs(content_id) where is_default;
create table public.marketing_templates(
 id uuid primary key default gen_random_uuid(),team_id uuid not null references public.marketing_teams(id),campaign_id uuid,scope text not null check(scope in('personal','team','campaign','official')),title text not null check(marketing_private.knowledge_text(title,180,true)),scene jsonb not null check(marketing_private.creative_scene(scene)),status text not null default 'draft' check(status in('draft','pending','approved','rejected')),creator_id uuid not null references public.profiles(id),reviewer_id uuid references public.profiles(id),reviewed_at timestamptz,review_reason text not null default '',version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(campaign_id,team_id) references public.marketing_campaigns(id,team_id),check((scope='campaign')=(campaign_id is not null)));
create table public.marketing_creative_versions(id uuid primary key default gen_random_uuid(),entity_type text not null check(entity_type in('design','template')),entity_id uuid not null,team_id uuid not null references public.marketing_teams(id),version integer not null,snapshot jsonb not null,actor_id uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(entity_type,entity_id,version));
create table public.marketing_creative_audit_logs(id uuid primary key default gen_random_uuid(),entity_type text not null,entity_id uuid not null,team_id uuid not null references public.marketing_teams(id),version integer not null,snapshot jsonb not null,action text not null,actor_id uuid not null references public.profiles(id),created_at timestamptz not null default now());
create function marketing_private.creative_read(team uuid,kind text,eid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when kind<>'template' then marketing_private.can_read(team) else exists(select 1 from public.marketing_templates t where t.id=eid and
 ((marketing_private.can_read(team) and (t.creator_id=auth.uid() or (t.scope<>'personal' and (t.status='approved' or exists(select 1 from public.user_roles r where r.user_id=auth.uid() and (r.role='Admin' or (r.role='PR Leader' and t.scope<>'official')))))))
 or (t.scope='official' and t.status='approved' and exists(select 1 from public.marketing_team_memberships m where m.user_id=auth.uid() and marketing_private.can_read(m.team_id))))) end;
$$;
create function marketing_private.creative_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name in('marketing_creative_versions','marketing_creative_audit_logs') or tg_op='DELETE' then raise exception 'Immutable history' using errcode='42501';end if;
 if (to_jsonb(new)-array['status','rights','rights_reason','allowed_channels','valid_until','reviewer_id','reviewed_at','version','updated_at']) is distinct from (to_jsonb(old)-array['status','rights','rights_reason','allowed_channels','valid_until','reviewer_id','reviewed_at','version','updated_at']) and tg_table_name='marketing_assets' then raise exception 'Immutable original' using errcode='42501';end if;
 return new;end $$;
do $$ declare t text;cond text;begin
 foreach t in array array['marketing_assets','marketing_designs','marketing_templates','marketing_creative_versions','marketing_creative_audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select on public.%I to authenticated',t);
 cond:=case when t='marketing_templates' then 'marketing_private.creative_read(team_id,''template'',id)' when t in('marketing_creative_versions','marketing_creative_audit_logs') then 'marketing_private.creative_read(team_id,entity_type,entity_id)' else 'marketing_private.can_read(team_id)' end;
 execute format('create policy creative_select on public.%I for select to authenticated using (%s)',t,cond);
 execute format('create trigger creative_guard before update or delete on public.%I for each row execute function marketing_private.creative_guard()',t);
 end loop;end $$;
create function marketing_private.creative_assets(scene jsonb,team uuid,campaign uuid,exporting boolean default false,official boolean default false) returns void language plpgsql set search_path='' as $$
declare aid uuid;a public.marketing_assets%rowtype;
begin
 for aid in select distinct (l->>'asset_id')::uuid from jsonb_array_elements(scene->'pages') p cross join lateral jsonb_array_elements(p->'layers') l where l->>'type'='image' order by 1 loop
 if official then raise exception 'Official templates cannot contain assets' using errcode='22023';end if;
 select * into a from public.marketing_assets where id=aid for share;
 if a.id is null or a.team_id<>team or (a.campaign_id is not null and a.campaign_id is distinct from campaign) or a.status<>'ready' then raise exception 'Image unavailable or wrong scope' using errcode='22023';end if;
 if exporting and (a.rights<>'approved' or not('facebook'=any(a.allowed_channels)) or (a.valid_until is not null and a.valid_until<=clock_timestamp())) then raise exception 'Current image rights block export' using errcode='22023';end if;
 end loop;end $$;
create function marketing_private.creative_command(p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();act text:=p_command->>'action';admin boolean;manager boolean;keys text[];k text;team uuid;result jsonb;kind text;current_version integer;idnew uuid;sc jsonb;refs jsonb;d public.marketing_designs%rowtype;t public.marketing_templates%rowtype;a public.marketing_assets%rowtype;c public.marketing_campaigns%rowtype;item public.marketing_content_items%rowtype;v public.marketing_creative_versions%rowtype;
begin
 perform 1 from public.profiles where id=actor and status='active' for share;if not found then raise exception 'Active identity required' using errcode='42501';end if;
 perform 1 from public.user_roles where user_id=actor order by role for share;
 select exists(select 1 from public.user_roles where user_id=actor and role='Admin'),exists(select 1 from public.user_roles where user_id=actor and role in('Admin','PR Leader')) into admin,manager;
 if not exists(select 1 from public.user_roles where user_id=actor and role in('Admin','PR Leader','PR Representative')) then raise exception 'Writer required' using errcode='42501';end if;
 keys:=case act
 when 'reserve_asset' then array['action','team_id','campaign_id','title','filename','mime_type','byte_size','width','height','reported_sha256','provenance','author','event','tags']
 when 'complete_asset' then array['action','id','expected_version'] when 'review_asset' then array['action','id','expected_version','rights','reason','allowed_channels','valid_until']
 when 'create_design' then array['action','content_id','title','scene'] when 'save_design' then array['action','id','expected_version','title','scene']
 when 'create_variant' then array['action','id','expected_version','title'] when 'restore_design' then array['action','id','expected_version','version_id']
 when 'save_template' then array['action','design_id','expected_version','title','scope'] when 'submit_template' then array['action','id','expected_version']
 when 'review_template' then array['action','id','expected_version','decision','reason'] when 'apply_template' then array['action','template_id','template_version','design_id','expected_version'] when 'prepare_export' then array['action','id','expected_version'] end;
 if keys is null or octet_length(p_command::text)>262144 or not coalesce(marketing_private.creative_keys(p_command,keys),false) then raise exception 'Invalid command fields' using errcode='22023';end if;
 foreach k in array keys loop
 if k in('id','team_id','campaign_id','content_id','version_id','design_id','template_id') and not(k='campaign_id' and p_command->k='null'::jsonb) and not coalesce(marketing_private.creative_uuid(p_command->k),false) then raise exception 'Invalid UUID' using errcode='22023';end if;
 if k in('expected_version','template_version','byte_size','width','height') and (not marketing_private.creative_number(p_command->k,1,2147483647) or (p_command->>k)::numeric<>trunc((p_command->>k)::numeric)) then raise exception 'Invalid integer' using errcode='22023';end if;
 if k in('title','filename','provenance','author','event','reason','mime_type','reported_sha256','rights','decision','scope') then
 if jsonb_typeof(p_command->k)<>'string' then raise exception 'Expected string' using errcode='22023';end if;
 if k in('title','filename','provenance','author','event','reason') then
 if not marketing_private.knowledge_text(p_command->>k,case k when 'title' then 180 when 'filename' then 255 when 'author' then 200 when 'event' then 200 else 2000 end,k in('title','filename','reason','provenance','author')) then raise exception 'Invalid text' using errcode='22023';end if;
 p_command:=jsonb_set(p_command,array[k],to_jsonb(marketing_private.trim_text(p_command->>k)));end if;end if;
 end loop;
 if p_command ? 'scene' and not marketing_private.creative_scene(p_command->'scene') then raise exception 'Invalid scene' using errcode='22023';end if;
 if act='reserve_asset' then team:=(p_command->>'team_id')::uuid;
 elsif act in('complete_asset','review_asset') then select * into a from public.marketing_assets where id=(p_command->>'id')::uuid for update;team:=a.team_id;current_version:=a.version;
 elsif act in('submit_template','review_template') then select * into t from public.marketing_templates where id=(p_command->>'id')::uuid for update;team:=t.team_id;current_version:=t.version;
 else
 if act='create_design' then select * into item from public.marketing_content_items where id=(p_command->>'content_id')::uuid;
 else select * into d from public.marketing_designs where id=coalesce(p_command->>'design_id',p_command->>'id')::uuid;select * into item from public.marketing_content_items where id=d.content_id;end if;
 select * into c from public.marketing_campaigns where id=item.campaign_id for update;select * into item from public.marketing_content_items where id=item.id for update;
 if d.id is not null then select * into d from public.marketing_designs where id=d.id for update;end if;
 team:=item.team_id;current_version:=d.version;
 if item.id is null or c.status not in('draft','active') or item.publishing_status not in('draft','changes_requested') then raise exception 'Editable content in eligible campaign required' using errcode='22023';end if;
 end if;
 if team is null then raise exception 'Entity unavailable' using errcode='42501';end if;
 perform 1 from public.marketing_teams where id=team for share;
 if not admin then perform 1 from public.marketing_team_memberships where team_id=team and user_id=actor for share;if not found then raise exception 'Membership required' using errcode='42501';end if;end if;
 if p_command ? 'expected_version' and current_version<>(p_command->>'expected_version')::integer then
 if not(act='complete_asset' and a.status='ready' and a.version=2 and (p_command->>'expected_version')::integer=1 and a.creator_id=actor) then raise exception 'Version conflict' using errcode='40001';end if;end if;
 if act='reserve_asset' then
 if jsonb_typeof(p_command->'tags')='array' and exists(select 1 from jsonb_array_elements(p_command->'tags') x where jsonb_typeof(x)<>'string' or marketing_private.text_length(x#>>'{}')>80) then raise exception 'Invalid tags' using errcode='22023';end if;
 if jsonb_typeof(p_command->'tags')='array' then select jsonb_set(p_command,'{tags}',coalesce(jsonb_agg(case when jsonb_typeof(x)='string' then to_jsonb(marketing_private.trim_text(x#>>'{}')) else x end),'[]')) into p_command from jsonb_array_elements(p_command->'tags') x;end if;
 if p_command->>'filename' ~ '[/\\[:cntrl:]]' or p_command->>'filename' like '.%' or position('..' in p_command->>'filename')>0 then raise exception 'Invalid filename' using errcode='22023';end if;
 if jsonb_typeof(p_command->'tags')<>'array' or jsonb_array_length(p_command->'tags')>20 or exists(select 1 from jsonb_array_elements(p_command->'tags') x where jsonb_typeof(x)<>'string' or not marketing_private.knowledge_text(x#>>'{}',80,true) or x#>>'{}'<>marketing_private.trim_text(x#>>'{}')) or (select count(distinct x) from jsonb_array_elements(p_command->'tags') x)<>jsonb_array_length(p_command->'tags') then raise exception 'Invalid tags' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('creative-upload:'||actor::text,0));
 if (select count(*) from public.marketing_assets where creator_id=actor and status='pending_upload' and created_at>clock_timestamp()-interval '20 minutes')>=10 then raise exception 'Pending upload limit' using errcode='22023';end if;
 idnew:=gen_random_uuid();insert into public.marketing_assets(id,team_id,campaign_id,title,filename,mime_type,byte_size,width,height,reported_sha256,storage_path,provenance,author,event,tags,creator_id) values(idnew,team,(p_command->>'campaign_id')::uuid,p_command->>'title',p_command->>'filename',p_command->>'mime_type',(p_command->>'byte_size')::integer,(p_command->>'width')::integer,(p_command->>'height')::integer,p_command->>'reported_sha256',team::text||'/'||idnew::text||'/original.'||case p_command->>'mime_type' when 'image/png' then 'png' else 'jpg' end,p_command->>'provenance',p_command->>'author',p_command->>'event',array(select jsonb_array_elements_text(p_command->'tags')),actor) returning * into a;result:=to_jsonb(a);kind:='asset';
 elsif act='complete_asset' then
 if a.creator_id<>actor then raise exception 'Reservation creator required' using errcode='42501';end if;
 if a.status='ready' then return to_jsonb(a);end if;
 if a.created_at<=clock_timestamp()-interval '20 minutes' or not exists(select 1 from storage.objects o where o.bucket_id='marketing-originals' and o.name=a.storage_path and o.metadata->>'mimetype'=a.mime_type and o.metadata->>'size'=a.byte_size::text) then raise exception 'Valid uploaded object metadata required' using errcode='22023';end if;
 update public.marketing_assets set status='ready',version=version+1,updated_at=now() where id=a.id returning * into a;result:=to_jsonb(a);kind:='asset';
 elsif act='review_asset' then
 if not manager then raise exception 'Manager required' using errcode='42501';end if;
 if a.status<>'ready' or p_command->>'rights' not in('needs_review','approved','internal_only','revoked') or jsonb_typeof(p_command->'allowed_channels')<>'array' or exists(select 1 from jsonb_array_elements(p_command->'allowed_channels') x where jsonb_typeof(x)<>'string' or x#>>'{}' not in('facebook','internal')) or (select count(distinct x) from jsonb_array_elements(p_command->'allowed_channels') x)<>jsonb_array_length(p_command->'allowed_channels') then raise exception 'Invalid rights' using errcode='22023';end if;
 if not marketing_private.creative_timestamp(p_command->'valid_until') then raise exception 'Invalid expiry' using errcode='22023';end if;
 if p_command->>'rights'='approved' and (a.provenance='' or a.author='' or not(p_command->'allowed_channels' ? 'facebook') or (p_command->>'valid_until')::timestamptz<=clock_timestamp()) then raise exception 'Approval provenance, author and Facebook rights required' using errcode='22023';end if;
 update public.marketing_assets set rights=p_command->>'rights',rights_reason=p_command->>'reason',allowed_channels=array(select jsonb_array_elements_text(p_command->'allowed_channels')),valid_until=(p_command->>'valid_until')::timestamptz,reviewer_id=actor,reviewed_at=now(),version=version+1,updated_at=now() where id=a.id returning * into a;result:=to_jsonb(a);kind:='asset';
 elsif act in('submit_template','review_template') then
 if act='submit_template' then
 if t.creator_id<>actor or t.scope='personal' or t.status not in('draft','rejected') then raise exception 'Creator draft shared template required' using errcode='42501';end if;
 update public.marketing_templates set status='pending',version=version+1,updated_at=now() where id=t.id returning * into t;
 else
 if not manager or (t.scope='official' and not admin) or t.scope='personal' or t.status<>'pending' then raise exception 'Scoped template review required' using errcode='42501';end if;
 if p_command->>'decision' not in('approve','reject') then raise exception 'Invalid decision' using errcode='22023';end if;
 if p_command->>'decision'='approve' then perform marketing_private.creative_assets(t.scene,team,t.campaign_id,true,t.scope='official');end if;
 update public.marketing_templates set status=case p_command->>'decision' when 'approve' then 'approved' else 'rejected' end,review_reason=p_command->>'reason',reviewer_id=actor,reviewed_at=now(),version=version+1,updated_at=now() where id=t.id returning * into t;end if;result:=to_jsonb(t);kind:='template';
 elsif act='save_template' then
 if p_command->>'scope' not in('personal','team','campaign','official') or (p_command->>'scope'='official' and not admin) then raise exception 'Invalid template scope' using errcode='42501';end if;
 perform marketing_private.creative_assets(d.scene,team,case when p_command->>'scope'='campaign' then d.campaign_id else null end,true,p_command->>'scope'='official');
 insert into public.marketing_templates(team_id,campaign_id,scope,title,scene,creator_id) values(team,case when p_command->>'scope'='campaign' then d.campaign_id else null end,p_command->>'scope',p_command->>'title',d.scene,actor) returning * into t;result:=to_jsonb(t);kind:='template';
 else
 if act='prepare_export' then for refs in select evidence from public.marketing_ideas where content_id=item.id and status='selected' loop perform marketing_private.knowledge_evidence(team,refs);end loop;perform marketing_private.creative_assets(d.scene,team,d.campaign_id,true);result:=to_jsonb(d);kind:='design';
 else
 if act='create_design' then
 select * into d from public.marketing_designs where content_id=item.id and is_default;
 if d.id is not null then return to_jsonb(d);end if;sc:=p_command->'scene';
 elsif act='save_design' then sc:=p_command->'scene';
 elsif act='create_variant' then sc:=d.scene;
 elsif act='restore_design' then
 select * into v from public.marketing_creative_versions where id=(p_command->>'version_id')::uuid and entity_type='design' and entity_id=d.id and team_id=team;
 if v.id is null then raise exception 'Version unavailable' using errcode='42501';end if;sc:=v.snapshot->'scene';
 elsif act='apply_template' then
 select * into t from public.marketing_templates where id=(p_command->>'template_id')::uuid for share;
 if t.id is null or (t.team_id<>team and not(t.scope='official' and t.status='approved')) or (t.campaign_id is not null and t.campaign_id<>d.campaign_id) or not(t.creator_id=actor or (t.scope<>'personal' and t.status='approved')) then raise exception 'Template unavailable' using errcode='42501';end if;
 if t.version<>(p_command->>'template_version')::integer then raise exception 'Template version conflict' using errcode='40001';end if;sc:=t.scene;
 end if;
 perform marketing_private.creative_assets(sc,team,item.campaign_id,act='apply_template');
 if act in('create_design','create_variant') then
 insert into public.marketing_designs(content_id,campaign_id,team_id,title,scene,is_default,parent_design_id,creator_id) values(item.id,item.campaign_id,team,p_command->>'title',sc,act='create_design',case when act='create_variant' then d.id else null end,actor) returning * into d;
 else update public.marketing_designs set title=coalesce(p_command->>'title',title),scene=sc,version=version+1,updated_at=now() where id=d.id returning * into d;end if;
 update public.marketing_content_items set version=version+1,updated_at=now() where id=item.id returning * into item;
 insert into public.marketing_revisions(team_id,campaign_id,entity_type,entity_id,version,action,actor_id,snapshot) values(team,item.campaign_id,'content',item.id,item.version,act,actor,to_jsonb(item)||jsonb_build_object('creative_design',to_jsonb(d)));
 insert into public.marketing_audit_logs(team_id,entity_type,entity_id,version,action,actor_id,snapshot) values(team,'content',item.id,item.version,act,actor,jsonb_build_object('row',to_jsonb(item),'design',to_jsonb(d)));
 result:=to_jsonb(d);kind:='design';end if;end if;
 if kind in('design','template') and act<>'prepare_export' then insert into public.marketing_creative_versions(entity_type,entity_id,team_id,version,snapshot,actor_id) values(kind,(result->>'id')::uuid,team,(result->>'version')::integer,result,actor);end if;
 insert into public.marketing_creative_audit_logs(entity_type,entity_id,team_id,version,snapshot,action,actor_id) values(kind,(result->>'id')::uuid,team,(result->>'version')::integer,result,act,actor);return result;
end $$;
-- Conservative Phase 3 gate: all current variants must be ready because no final-variant selector exists.
-- Invoker trigger inherits the existing Foundation command definer, never a client grant.
create function marketing_private.creative_review_gate() returns trigger language plpgsql set search_path='' as $$
declare design public.marketing_designs%rowtype;refs jsonb;
begin
 for design in select * from public.marketing_designs where content_id=new.id order by id for share loop
  perform marketing_private.creative_assets(design.scene,new.team_id,new.campaign_id,true);
 end loop;
 for refs in select evidence from public.marketing_ideas where content_id=new.id and status='selected' order by id for share loop
  perform marketing_private.knowledge_evidence(new.team_id,refs);
 end loop;
 return new;
end $$;
create trigger marketing_creative_review_gate before update of publishing_status on public.marketing_content_items for each row when (new.publishing_status='in_review' and old.publishing_status is distinct from new.publishing_status) execute function marketing_private.creative_review_gate();
create function public.marketing_creative_command(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$ select marketing_private.creative_command(p_command) $$;
create function marketing_private.creative_storage(path text,upload boolean) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.marketing_assets a where a.storage_path=path and marketing_private.can_read(a.team_id) and a.rights<>'revoked' and (a.valid_until is null or a.valid_until>clock_timestamp()) and
 (case when upload then a.status='pending_upload' and a.creator_id=auth.uid() and a.created_at>clock_timestamp()-interval '20 minutes' and exists(select 1 from public.user_roles where user_id=auth.uid() and role in('Admin','PR Leader','PR Representative')) else a.status='ready' or (a.creator_id=auth.uid() and a.created_at>clock_timestamp()-interval '20 minutes') end));
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('marketing-originals','marketing-originals',false,8388608,array['image/png','image/jpeg']);
create policy marketing_original_insert on storage.objects for insert to authenticated with check(bucket_id='marketing-originals' and marketing_private.creative_storage(name,true));
create policy marketing_original_select on storage.objects for select to authenticated using(bucket_id='marketing-originals' and marketing_private.creative_storage(name,false));
revoke all on function public.marketing_creative_command(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.marketing_creative_command(jsonb) to authenticated;
do $$ declare f record;begin for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='marketing_private' and p.proname like 'creative_%' loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);end loop;end $$;
grant execute on function marketing_private.creative_command(jsonb),marketing_private.creative_read(uuid,text,uuid),marketing_private.creative_storage(text,boolean) to authenticated;
commit;
