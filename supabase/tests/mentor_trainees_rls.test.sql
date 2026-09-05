begin;

select plan(10);

select ok(
  not has_table_privilege('anon', 'public.mentor_trainees', 'select,insert,update,delete'),
  'anon has no Mentor–Trainee privileges'
);
select ok(
  has_table_privilege('authenticated', 'public.mentor_trainees', 'select'),
  'authenticated users receive SELECT only'
);
select ok(
  not has_table_privilege('authenticated', 'public.mentor_trainees', 'insert,update,delete'),
  'authenticated users cannot mutate assignments directly'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.mentor_trainees'::regclass),
  'RLS is enabled on Mentor–Trainee assignments'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'mentor_trainees_active_pair_idx'
  ),
  'active assignment uniqueness is indexed'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'mentor_trainees_mentor_active_idx'
  ),
  'Mentor lookup is indexed'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'mentor_trainees_trainee_active_idx'
  ),
  'Trainee lookup is indexed'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public'
     and tablename = 'mentor_trainees'
     and cmd = 'SELECT'),
  1,
  'one explicit SELECT policy protects assignment reads'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public'
     and tablename = 'mentor_trainees'
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
  0,
  'there are no authenticated write policies'
);
select ok(
  exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'mentor_trainees'
      and constraint_name = 'mentor_trainees_distinct_people'
  ),
  'Mentor cannot be assigned to themselves'
);

select * from finish();
rollback;
