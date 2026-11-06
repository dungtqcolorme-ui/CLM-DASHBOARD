begin;

-- Campaign versions bind publishing snapshots. KPI revisions have their own sequence.
alter table public.marketing_campaigns
  add column kpi_revision_version integer not null default 0 check (kpi_revision_version >= 0),
  add column pending_kpi_revision jsonb,
  add column effective_kpi_revision jsonb;

alter table public.marketing_revisions drop constraint marketing_revisions_entity_type_check;
alter table public.marketing_revisions add constraint marketing_revisions_entity_type_check
  check (entity_type in ('campaign', 'content', 'campaign_kpi'));

create function marketing_private.campaign_kpi_command(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := marketing_private.require_budget_actor(true);
  action text := payload->>'action';
  fields text[];
  is_admin boolean;
  campaign public.marketing_campaigns%rowtype;
  expected numeric;
  reason text;
  targets jsonb;
  revision jsonb;
  recorded_at timestamptz;
begin
  fields := case action
    when 'propose_kpi_revision' then array['action','id','expected_kpi_version','reason','targets']
    when 'confirm_kpi_revision' then array['action','id','expected_kpi_version','confirmed']
  end;
  if fields is null or jsonb_typeof(payload) is distinct from 'object'
    or octet_length(payload::text) > 262144 or not (payload ?& fields)
    or exists (select 1 from jsonb_object_keys(payload) as key where not (key = any(fields)))
    or not coalesce(marketing_private.creative_uuid(payload->'id'), false)
    or jsonb_typeof(payload->'expected_kpi_version') is distinct from 'number' then
    raise exception 'Invalid KPI revision command' using errcode = '22023';
  end if;
  expected := (payload->>'expected_kpi_version')::numeric;
  if expected < 0 or expected > 2147483646 or expected <> trunc(expected) then
    raise exception 'Invalid KPI revision version' using errcode = '22023';
  end if;

  select exists (select 1 from public.user_roles where user_id = actor and role = 'Admin') into is_admin;
  if action = 'confirm_kpi_revision' then
    if not is_admin and not exists (select 1 from public.user_roles where user_id = actor and role = 'PR Leader') then
      raise exception 'Leader or Admin required' using errcode = '42501';
    end if;
    if payload->'confirmed' is distinct from 'true'::jsonb then
      raise exception 'Explicit KPI confirmation required' using errcode = '22023';
    end if;
  end if;

  perform marketing_private.take_budget(actor, 'mutation', 240);
  select * into campaign from public.marketing_campaigns
    where id = (payload->>'id')::uuid and marketing_private.can_read(team_id) for update;
  if not found then raise exception 'Campaign unavailable' using errcode = '42501'; end if;
  if not is_admin then
    perform 1 from public.marketing_team_memberships where team_id = campaign.team_id and user_id = actor for share;
    if not found then raise exception 'Team membership required' using errcode = '42501'; end if;
  end if;
  if campaign.kpi_revision_version <> expected then
    raise exception 'KPI revision conflict' using errcode = '40001';
  end if;
  if campaign.status <> 'active' or campaign.official_kpis is null then
    raise exception 'An active campaign is required' using errcode = '22023';
  end if;

  recorded_at := clock_timestamp();

  if action = 'propose_kpi_revision' then
    reason := marketing_private.trim_text(payload->>'reason');
    targets := payload->'targets';
    if jsonb_typeof(payload->'reason') is distinct from 'string' or reason = ''
      or marketing_private.text_length(payload->>'reason') > 2000
      or not marketing_private.valid_kpis(targets) then
      raise exception 'Valid targets and a revision reason are required' using errcode = '22023';
    end if;
    if targets = coalesce(campaign.effective_kpi_revision->'targets', campaign.official_kpis) then
      raise exception 'KPI proposal must change the current targets' using errcode = '22023';
    end if;
    revision := jsonb_build_object(
      'version', campaign.kpi_revision_version + 1, 'targets', targets,
      'previous_targets', coalesce(campaign.effective_kpi_revision->'targets', campaign.official_kpis),
      'reason', reason, 'proposed_by', actor, 'proposed_at', recorded_at
    );
    update public.marketing_campaigns set pending_kpi_revision = revision,
      kpi_revision_version = kpi_revision_version + 1 where id = campaign.id returning * into campaign;
  else
    if campaign.pending_kpi_revision is null then
      raise exception 'There is no KPI proposal to confirm' using errcode = '22023';
    end if;
    revision := campaign.pending_kpi_revision || jsonb_build_object(
      'proposal_version', campaign.pending_kpi_revision->'version', 'version', campaign.kpi_revision_version + 1,
      'confirmed_by', actor, 'confirmed_at', recorded_at
    );
    update public.marketing_campaigns set pending_kpi_revision = null, effective_kpi_revision = revision,
      kpi_revision_version = kpi_revision_version + 1 where id = campaign.id returning * into campaign;
  end if;

  insert into public.marketing_revisions(team_id,campaign_id,entity_type,entity_id,version,action,actor_id,snapshot)
    values (campaign.team_id,campaign.id,'campaign_kpi',campaign.id,campaign.kpi_revision_version,action,actor,revision);
  return to_jsonb(campaign);
end;
$$;

create function public.marketing_campaign_kpi_command(p_command jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select marketing_private.campaign_kpi_command(p_command);
$$;
revoke all on function public.marketing_campaign_kpi_command(jsonb), marketing_private.campaign_kpi_command(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.marketing_campaign_kpi_command(jsonb), marketing_private.campaign_kpi_command(jsonb)
  to authenticated;

create or replace function public.marketing_readiness_probe()
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if current_setting('role', true) is distinct from 'authenticated' or not exists (
    select 1 from public.profiles p join public.user_roles r on r.user_id = p.id
    where p.id = auth.uid() and p.status = 'active' and r.role = 'Admin'
  ) then
    raise exception 'Active Admin required' using errcode = '42501';
  end if;
  return '20261106000200';
end;
$$;

commit;
