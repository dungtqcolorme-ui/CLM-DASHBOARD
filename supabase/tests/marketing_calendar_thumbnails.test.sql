begin;
create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',label; end if; end; $$;
create function pg_temp.denied(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlstate<>expected then raise exception 'Expected %, got %',expected,sqlstate; end if;
    return;
  end;
  raise exception 'Unexpectedly permitted: %',statement;
end; $$;
select pg_temp.expect(to_regprocedure('public.marketing_reserve_calendar_thumbnail()') is not null,'thumbnail budget RPC required');
insert into auth.users(id,email) values
('82000000-0000-4000-8000-000000000001','thumb-admin@test.invalid'),
('82000000-0000-4000-8000-000000000002','thumb-viewer@test.invalid');
insert into public.profiles(id,email,status) select id,email,'active' from auth.users where email like 'thumb-%';
insert into public.user_roles(user_id,role) values
('82000000-0000-4000-8000-000000000001','Admin'),('82000000-0000-4000-8000-000000000002','Viewer');
select pg_temp.expect(not has_function_privilege('anon','public.marketing_reserve_calendar_thumbnail()','execute'),'no anon budget');
select pg_temp.expect(not has_function_privilege('service_role','public.marketing_reserve_calendar_thumbnail()','execute'),'no service budget');
select pg_temp.expect(not has_table_privilege('authenticated','marketing_private.command_budgets','select,insert,update,delete'),'counters stay private');
set local role authenticated;
select set_config('request.jwt.claim.sub','82000000-0000-4000-8000-000000000001',true);
do $$ begin for n in 1..30 loop perform public.marketing_reserve_calendar_thumbnail(); end loop; end; $$;
reset role;
select pg_temp.expect((select sum(used)=30 from marketing_private.command_budgets where actor_id='82000000-0000-4000-8000-000000000001' and budget='thumbnail'),'30 reservations recorded');
-- Fill both sides of a potential minute boundary to keep the rejection test deterministic.
insert into marketing_private.command_budgets(actor_id,minute_bucket,budget,used)
select '82000000-0000-4000-8000-000000000001',floor(extract(epoch from clock_timestamp())/60)+n,'thumbnail',30 from generate_series(0,1) n
on conflict(actor_id,minute_bucket,budget) do update set used=30;
set local role authenticated;
select pg_temp.denied('select public.marketing_reserve_calendar_thumbnail()','P0429');
select public.marketing_reserve_report_export();
select set_config('request.jwt.claim.sub','82000000-0000-4000-8000-000000000002',true);
select public.marketing_reserve_calendar_thumbnail();
reset role;
select pg_temp.expect((select sum(used)=1 from marketing_private.command_budgets where actor_id='82000000-0000-4000-8000-000000000002' and budget='thumbnail'),'Viewer budget independent');
update public.profiles set status='locked' where id='82000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.denied('select public.marketing_reserve_calendar_thumbnail()','42501');
reset role;
rollback;
