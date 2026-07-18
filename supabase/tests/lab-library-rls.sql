-- Disposable-project verification for migration 202607170004.
-- Replace both UUIDs with real disposable Auth users. Never run against
-- production data.
begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(13);

\set admin_user '00000000-0000-4000-8000-00000000000a'
\set viewer_user '00000000-0000-4000-8000-00000000000b'
\set lab_id '50000000-0000-4000-8000-000000000001'
\set entry_id '50000000-0000-4000-8000-000000000002'
\set version_id '50000000-0000-4000-8000-000000000003'
\set invitation_id '50000000-0000-4000-8000-000000000004'
\set audit_id '50000000-0000-4000-8000-000000000005'

insert into public.profiles (user_id, display_name) values
  (:'admin_user', 'Lab Admin'), (:'viewer_user', 'Lab Viewer')
on conflict (user_id) do update set display_name=excluded.display_name;
insert into public.labs (id,name,description,created_by,retention_policy)
values (:'lab_id','Disposable private lab','RLS verification',:'admin_user','{"purgeAfterDays":30}')
on conflict (id) do nothing;
insert into public.lab_members (lab_id,user_id,role,membership_status,joined_at) values
  (:'lab_id',:'admin_user','admin','active',now()),
  (:'lab_id',:'viewer_user','viewer','active',now())
on conflict (lab_id,user_id) do update set role=excluded.role,membership_status='active';
insert into public.lab_library_entries (id,lab_id,title,description,created_by)
values (:'entry_id',:'lab_id','Published fixture','',:'admin_user')
on conflict (id) do nothing;
insert into public.lab_library_versions
  (id,entry_id,lab_id,version_number,published_by,scientific_input,calculation_snapshot,schema_version,engine_version,content_digest,target_formula,verification_status)
values
  (:'version_id',:'entry_id',:'lab_id',1,:'admin_user','{}','{}','11.0.0','0.6.1',repeat('a',64),'Ti2AlN','arithmetic-verified')
on conflict (id) do nothing;
update public.lab_library_entries set current_version_id=:'version_id' where id=:'entry_id';
insert into public.lab_invitations (id,lab_id,email_normalized,intended_role,token_digest,invited_by,expires_at)
values (:'invitation_id',:'lab_id','pending@example.edu','member',repeat('b',64),:'admin_user',now()+interval '7 days')
on conflict (id) do nothing;
insert into public.lab_audit_events (id,lab_id,actor_user_id,event_type,target_type,target_id,metadata)
values (:'audit_id',:'lab_id',:'admin_user','entry.published','library-entry',:'entry_id','{"safe":true}')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'viewer_user',true);

select extensions.is((select count(*) from public.labs where id=:'lab_id'),1::bigint,'viewer reads authorized lab');
select extensions.is((select count(*) from public.lab_library_entries where id=:'entry_id'),1::bigint,'viewer reads active entry');
select extensions.is((select count(*) from public.lab_library_versions where id=:'version_id'),1::bigint,'viewer reads immutable version');
select extensions.is((select count(*) from public.lab_invitations),0::bigint,'viewer cannot read invitations');
select extensions.is((select count(*) from public.lab_audit_events),0::bigint,'viewer cannot read raw audit');
select extensions.throws_ok(
  format($$ update public.lab_library_versions set target_formula='Ti3AlC2' where id='%s' $$,:'version_id'),
  '42501','viewer cannot mutate immutable version'
);
select extensions.throws_ok(
  format($$ select public.create_lab_invitation('%s','forged@example.edu','member',repeat('c',64),now()+interval '1 day','test') $$,:'lab_id'),
  '42501','viewer cannot create invitation'
);

select set_config('request.jwt.claim.sub',:'admin_user',true);
select extensions.is((select count(*) from public.lab_invitations where id=:'invitation_id'),1::bigint,'admin reads invitations');
select extensions.is((select count(*) from public.lab_audit_events where id=:'audit_id'),1::bigint,'admin reads safe audit');
select extensions.throws_ok(
  format($$ update public.lab_library_versions set target_formula='Ti3AlC2' where id='%s' $$,:'version_id'),
  '42501','admin table grant cannot mutate immutable version'
);
select extensions.throws_ok(
  format($$ select public.manage_lab_member('%s','%s','admin','removed','last-admin-test') $$,:'lab_id',:'admin_user'),
  '23000','last active admin cannot remove self'
);
select extensions.lives_ok(
  format($$ select public.revoke_lab_invitation('%s','revoke-test') $$,:'invitation_id'),
  'admin can revoke unused invitation'
);
select extensions.ok(
  (select revoked_at is not null from public.lab_invitations where id=:'invitation_id'),
  'revocation is persisted'
);

select * from extensions.finish();
rollback;
