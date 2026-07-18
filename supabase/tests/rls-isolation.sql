-- Run against a disposable Supabase project after replacing the two UUIDs with
-- confirmed Auth user IDs. The assertions deliberately use the authenticated
-- role and JWT subject claims; do not run this file against production data.
begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(17);

-- Test fixtures are created by the service context before assuming an ordinary
-- authenticated role. Replace these values with disposable test users.
\set user_a '00000000-0000-4000-8000-00000000000a'
\set user_b '00000000-0000-4000-8000-00000000000b'
\set lab_a  '00000000-0000-4000-8000-00000000000c'
\set recipe_a '10000000-0000-4000-8000-00000000000a'
\set recipe_b '10000000-0000-4000-8000-00000000000b'
\set revision_a '20000000-0000-4000-8000-00000000000a'
\set revision_b '20000000-0000-4000-8000-00000000000b'

insert into public.profiles (user_id, display_name)
values (:'user_a', 'User A'), (:'user_b', 'User B')
on conflict (user_id) do update set display_name = excluded.display_name;
insert into public.labs (id, name, created_by)
values (:'lab_a', 'User A lab', :'user_a')
on conflict (id) do nothing;
insert into public.lab_members (lab_id, user_id, role)
values (:'lab_a', :'user_a', 'admin')
on conflict (lab_id, user_id) do nothing;
insert into public.recipes (id, local_record_id, owner_id, name, target_formula, created_at)
values
  (:'recipe_a', 'recipe-a', :'user_a', 'User A recipe', 'Ti2AlN', now()),
  (:'recipe_b', 'recipe-b', :'user_b', 'User B recipe', 'Ti2AlN', now())
on conflict (id) do nothing;
insert into public.recipe_revisions (id, local_record_id, recipe_id, owner_id, revision_number, scientific_input, calculation_snapshot, schema_version, engine_version, created_at, created_by, content_digest)
values
  (:'revision_a', 'revision-a', :'recipe_a', :'user_a', 1, '{"targetFormula":"Ti2AlN"}', '{"digest":"a"}', '9.0.0', '0.6.1', now(), :'user_a', 'digest-a'),
  (:'revision_b', 'revision-b', :'recipe_b', :'user_b', 1, '{"targetFormula":"Ti2AlN"}', '{"digest":"b"}', '9.0.0', '0.6.1', now(), :'user_b', 'digest-b')
on conflict (id) do nothing;
update public.recipes set current_revision_id = :'revision_a' where id = :'recipe_a';
update public.recipes set current_revision_id = :'revision_b' where id = :'recipe_b';
insert into public.comparisons (id, local_record_id, owner_id, name, comparison_data, schema_version, created_at)
values
  ('30000000-0000-4000-8000-00000000000a', 'comparison-a', :'user_a', 'A comparison', '{"scenarios":[]}', '9.0.0', now()),
  ('30000000-0000-4000-8000-00000000000b', 'comparison-b', :'user_b', 'B comparison', '{"scenarios":[]}', '9.0.0', now())
on conflict (id) do nothing;
insert into public.user_settings (owner_id, settings_data, schema_version)
values (:'user_a', '{"appearance":"dark"}', '4.0.0'), (:'user_b', '{"appearance":"light"}', '4.0.0')
on conflict (owner_id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select extensions.results_eq(
  $$ select user_id from public.profiles order by user_id $$,
  format($$ values ('%s'::uuid) $$, :'user_a'),
  'User A can read only User A profile'
);
select extensions.is((select display_name from public.profiles where user_id = :'user_a'), 'User A', 'User A reads own profile');
select extensions.lives_ok($$ update public.profiles set display_name = 'User A updated' where user_id = :'user_a' $$, 'User A can update own display name');
select extensions.throws_ok($$ update public.profiles set user_id = :'user_b' where user_id = :'user_a' $$, '42501', 'User ID cannot be changed');
select extensions.is((select count(*) from public.labs), 1::bigint, 'Lab member can read own lab');
select extensions.is((select count(*) from public.lab_members), 1::bigint, 'Lab member can read membership rows for own lab');
select extensions.results_eq($$ select local_record_id from public.recipes order by local_record_id $$, $$ values ('recipe-a'::text) $$, 'User A reads only User A recipes');
select extensions.is((select count(*) from public.recipe_revisions), 1::bigint, 'User A reads only User A revisions');
select extensions.lives_ok($$ insert into public.recipes (id, local_record_id, owner_id, name, created_at) values ('10000000-0000-4000-8000-00000000000d', 'recipe-a-new', '00000000-0000-4000-8000-00000000000a', 'Own insert', now()) $$, 'User A can insert an own recipe');
select extensions.throws_ok($$ insert into public.recipes (id, local_record_id, owner_id, name, created_at) values ('10000000-0000-4000-8000-00000000000e', 'recipe-b-forged', '00000000-0000-4000-8000-00000000000b', 'Forged insert', now()) $$, '42501', 'User A cannot insert a recipe owned by User B');
select extensions.throws_ok($$ update public.recipe_revisions set scientific_input = '{"changed":true}' where id = '20000000-0000-4000-8000-00000000000a' $$, '42501', 'Authenticated users cannot update immutable revisions');
select extensions.throws_ok($$ insert into public.recipe_notes (id, local_record_id, recipe_id, owner_id, category, title, body, created_at) values ('40000000-0000-4000-8000-00000000000a', 'cross-owner-note', '10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000a', 'General', 'Cross owner', '', now()) $$, '23503', 'A note cannot attach to another owner recipe');
select extensions.is((select count(*) from public.comparisons), 1::bigint, 'Comparisons are account scoped');
select extensions.is((select count(*) from public.user_settings), 1::bigint, 'Settings are account scoped');
select extensions.is((select count(*) from public.recipes where id = :'recipe_a' and version = 999), 0::bigint, 'A stale expected recipe version matches no row');

select set_config('request.jwt.claim.sub', :'user_b', true);
select extensions.is((select count(*) from public.profiles where user_id = :'user_a'), 0::bigint, 'User B cannot read User A profile');
select extensions.is((select count(*) from public.labs where id = :'lab_a'), 0::bigint, 'Nonmember cannot read a private lab');

select * from extensions.finish();
rollback;
