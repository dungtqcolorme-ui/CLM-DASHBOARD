begin;

create table public.marketing_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.marketing_teams(id),
  campaign_id uuid not null references public.marketing_campaigns(id),
  content_id uuid references public.marketing_content_items(id),
  content_version integer,
  subject text not null check (char_length(subject) between 1 and 180),
  kind text not null check (kind in (
    'review_requested','changes_requested','approved','published','publish_failed','critical_incident','emergency_hold'
  )),
  entity_id uuid not null,
  entity_version integer not null check (entity_version > 0),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique (recipient_id, kind, entity_id, entity_version),
  check ((content_id is null and content_version is null) or
    (content_id is not null and content_version is not null and content_version > 0))
);

create index marketing_notifications_recent on public.marketing_notifications(recipient_id, created_at desc, id desc);
create index marketing_notifications_campaign_recent on public.marketing_notifications(recipient_id, campaign_id, created_at desc, id desc);
alter table public.marketing_notifications enable row level security;
revoke all on public.marketing_notifications from public, anon, authenticated, service_role;
grant select on public.marketing_notifications to authenticated;

create function marketing_private.can_read_notification(p_recipient uuid, p_team uuid, p_kind text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_recipient = auth.uid() and marketing_private.can_read(p_team)
    and (p_kind not in ('review_requested','emergency_hold') or exists (
      select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('Admin','PR Leader')
    ));
$$;
revoke all on function marketing_private.can_read_notification(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function marketing_private.can_read_notification(uuid,uuid,text) to authenticated;
create policy marketing_notice_recipient_read on public.marketing_notifications for select to authenticated
  using (marketing_private.can_read_notification(recipient_id,team_id,kind));

create function marketing_private.enqueue_notification(
  p_team uuid, p_campaign uuid, p_content uuid, p_content_version integer, p_kind text,
  p_entity uuid, p_entity_version integer, p_subject text, p_creator uuid, p_assignee uuid
) returns void language sql set search_path='' as $$
  insert into public.marketing_notifications(recipient_id,team_id,campaign_id,content_id,content_version,kind,entity_id,entity_version,subject)
  select p.id,p_team,p_campaign,p_content,p_content_version,p_kind,p_entity,p_entity_version,
    coalesce(p_subject,(select c.name from public.marketing_campaigns c where c.id=p_campaign))
  from public.profiles p
  where p.status='active' and exists (
    select 1 from public.user_roles r
    where r.user_id=p.id
      and (r.role='Admin' or exists (
        select 1 from public.marketing_team_memberships m where m.team_id=p_team and m.user_id=p.id
      ))
      and case
        when p_kind='review_requested' then r.role in ('Admin','PR Leader') and p.id<>p_creator
        when p_kind='emergency_hold' then r.role in ('Admin','PR Leader')
        when p_kind='critical_incident' then r.role in ('Admin','PR Leader') or p.id=p_assignee
        else p.id in (p_creator,p_assignee)
      end
  )
  on conflict (recipient_id,kind,entity_id,entity_version) do nothing;
$$;

create function marketing_private.notify_marketing_transition()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  item public.marketing_content_items;
  notice_kind text;
  frozen_version integer;
  frozen_subject text;
begin
  if tg_table_name='marketing_content_items' then
    if new.publishing_status is not distinct from old.publishing_status then return new; end if;
    notice_kind := case new.publishing_status
      when 'in_review' then 'review_requested'
      when 'changes_requested' then 'changes_requested'
      when 'approved' then 'approved'
      when 'published' then 'published'
    end;
    if notice_kind is null then return new; end if;
    if notice_kind in ('approved','published') then
      select a.content_version,a.snapshot->'content'->>'title' into frozen_version,frozen_subject
      from public.marketing_publishing_jobs j
      join public.marketing_approval_snapshots a on a.id=j.approval_id
      where j.content_id=new.id and j.campaign_id=new.campaign_id and j.team_id=new.team_id
        and a.content_id=new.id and a.team_id=new.team_id
        and ((notice_kind='approved' and j.status='queued') or
             (notice_kind='published' and j.status='published' and j.receipt->'verified'='true'::jsonb))
      order by j.created_at desc,j.id desc limit 1;
      if frozen_version is null then return new; end if;
    end if;
    perform marketing_private.enqueue_notification(new.team_id,new.campaign_id,new.id,
      coalesce(frozen_version,new.version),notice_kind,new.id,new.version,
      coalesce(frozen_subject,new.title),new.creator_id,new.assignee_id);
  elsif tg_table_name='marketing_campaigns' then
    if new.status='emergency_hold' and old.status is distinct from new.status then
      perform marketing_private.enqueue_notification(new.team_id,new.id,null,null,
        'emergency_hold',new.id,new.version,new.name,null,null);
    end if;
  elsif tg_table_name='marketing_publishing_jobs' then
    if new.status in ('failed','dead_letter') and old.status is distinct from new.status then
      select * into item from public.marketing_content_items where id=new.content_id;
      select content_version,snapshot->'content'->>'title' into frozen_version,frozen_subject
      from public.marketing_approval_snapshots where id=new.approval_id;
      perform marketing_private.enqueue_notification(new.team_id,new.campaign_id,item.id,frozen_version,
        'publish_failed',new.id,1,coalesce(frozen_subject,item.title),item.creator_id,item.assignee_id);
    end if;
  elsif tg_table_name='marketing_publishing_incidents' and new.severity='critical' and new.status='open' then
    if new.content_id is not null then
      select * into item from public.marketing_content_items where id=new.content_id;
    end if;
    if new.job_id is not null then
      select a.content_version,a.snapshot->'content'->>'title' into frozen_version,frozen_subject
      from public.marketing_publishing_jobs j
      join public.marketing_approval_snapshots a on a.id=j.approval_id
      where j.id=new.job_id and j.team_id=new.team_id and j.content_id=new.content_id
        and a.team_id=new.team_id and a.content_id=new.content_id;
    end if;
    perform marketing_private.enqueue_notification(new.team_id,new.campaign_id,new.content_id,
      coalesce(frozen_version,item.version),'critical_incident',new.id,1,
      coalesce(frozen_subject,item.title),item.creator_id,item.assignee_id);
  end if;
  return new;
end;
$$;

revoke all on function marketing_private.enqueue_notification(uuid,uuid,uuid,integer,text,uuid,integer,text,uuid,uuid),
  marketing_private.notify_marketing_transition() from public,anon,authenticated,service_role;
create trigger marketing_notify_content after update of publishing_status on public.marketing_content_items
  for each row execute function marketing_private.notify_marketing_transition();
create trigger marketing_notify_hold after update of status on public.marketing_campaigns
  for each row execute function marketing_private.notify_marketing_transition();
create trigger marketing_notify_failed_job after update of status on public.marketing_publishing_jobs
  for each row execute function marketing_private.notify_marketing_transition();
create trigger marketing_notify_incident after insert on public.marketing_publishing_incidents
  for each row execute function marketing_private.notify_marketing_transition();

create function public.marketing_mark_notification_read(p_id uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare
  actor uuid := marketing_private.require_budget_actor(false);
  marked_at timestamptz;
begin
  perform marketing_private.take_budget(actor,'mutation',240);
  update public.marketing_notifications n
  set read_at=coalesce(n.read_at,clock_timestamp())
  where n.id=p_id and n.recipient_id=actor
    and marketing_private.can_read_notification(n.recipient_id,n.team_id,n.kind)
  returning n.read_at into marked_at;
  return marked_at;
end;
$$;
revoke all on function public.marketing_mark_notification_read(uuid) from public,anon,authenticated,service_role;
grant execute on function public.marketing_mark_notification_read(uuid) to authenticated;

create or replace function public.marketing_readiness_probe()
returns text language plpgsql stable security definer set search_path='' as $$
begin
  if current_setting('role',true) is distinct from 'authenticated' or not exists(
    select 1 from public.profiles p join public.user_roles r on r.user_id=p.id
    where p.id=auth.uid() and p.status='active' and r.role='Admin'
  ) then raise exception 'Active Admin required' using errcode='42501'; end if;
  return '20261109000100';
end;
$$;
commit;
