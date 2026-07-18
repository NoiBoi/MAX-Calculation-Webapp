begin;

alter table public.labs
  add column description text not null default '' check (char_length(description) <= 4000),
  add column updated_at timestamptz not null default now(),
  add column archived_at timestamptz null,
  add column retention_policy jsonb not null default '{"purgeAfterDays":null}'::jsonb
    check ((retention_policy ->> 'purgeAfterDays') is null or (retention_policy ->> 'purgeAfterDays')::integer in (30, 90, 365));

alter table public.lab_members
  add column membership_status text not null default 'active' check (membership_status in ('invited', 'active', 'suspended', 'removed')),
  add column email_normalized text null,
  add column invited_by uuid null references auth.users(id) on delete set null,
  add column joined_at timestamptz null,
  add column updated_at timestamptz not null default now(),
  add column removed_at timestamptz null;

update public.lab_members set joined_at = created_at where membership_status = 'active' and joined_at is null;

create sequence public.maxcalc_lab_sync_sequence as bigint;

create table public.lab_invitations (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  email_normalized text not null check (email_normalized = lower(btrim(email_normalized))),
  intended_role text not null check (intended_role in ('admin', 'member', 'viewer')),
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now()
);

create table public.lab_library_entries (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  description text not null default '' check (char_length(description) <= 4000),
  current_version_id uuid null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  archived_by uuid null references auth.users(id) on delete set null,
  purge_eligible_at timestamptz null,
  visibility_status text not null default 'active' check (visibility_status in ('active', 'archived', 'retention-hold')),
  retention_hold_reason text null check (retention_hold_reason is null or char_length(retention_hold_reason) <= 500),
  version bigint not null default 1 check (version >= 1),
  sync_sequence bigint not null default nextval('public.maxcalc_lab_sync_sequence'),
  unique (lab_id, id)
);

create table public.lab_library_versions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  lab_id uuid not null references public.labs(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  source_personal_recipe_id uuid null,
  source_personal_revision_id uuid null,
  published_by uuid not null references auth.users(id) on delete restrict,
  publication_note text not null default '' check (char_length(publication_note) <= 4000),
  scientific_input jsonb not null,
  calculation_snapshot jsonb not null,
  schema_version text not null,
  engine_version text not null,
  content_digest text not null,
  adjusted_feed_formula text null,
  target_formula text not null,
  verification_status text not null,
  warning_count integer not null default 0 check (warning_count >= 0),
  created_at timestamptz not null default now(),
  sync_sequence bigint not null default nextval('public.maxcalc_lab_sync_sequence'),
  unique (entry_id, version_number),
  unique (lab_id, id),
  foreign key (lab_id, entry_id) references public.lab_library_entries(lab_id, id) on delete cascade
);

alter table public.lab_library_entries
  add constraint lab_entries_current_version_fk
  foreign key (lab_id, current_version_id)
  references public.lab_library_versions(lab_id, id)
  deferrable initially deferred;

create table public.lab_publication_notes (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  entry_id uuid not null,
  publication_version_id uuid not null,
  source_personal_note_id uuid null,
  category text not null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(body) <= 20000),
  tags text[] not null default '{}',
  experiment_date date null,
  published_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  content_digest text not null,
  sync_sequence bigint not null default nextval('public.maxcalc_lab_sync_sequence'),
  unique (lab_id, id),
  foreign key (lab_id, entry_id) references public.lab_library_entries(lab_id, id) on delete cascade,
  foreign key (lab_id, publication_version_id) references public.lab_library_versions(lab_id, id) on delete cascade
);

create table public.lab_audit_events (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  event_type text not null,
  target_type text not null,
  target_id uuid null,
  target_version_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  request_id text null,
  source_device_id text null,
  sync_sequence bigint not null default nextval('public.maxcalc_lab_sync_sequence')
);

create index lab_invitations_lab_idx on public.lab_invitations (lab_id, created_at desc);
create index lab_entries_sync_idx on public.lab_library_entries (lab_id, sync_sequence, id);
create index lab_versions_sync_idx on public.lab_library_versions (lab_id, sync_sequence, id);
create index lab_notes_sync_idx on public.lab_publication_notes (lab_id, sync_sequence, id);
create index lab_audit_sync_idx on public.lab_audit_events (lab_id, sync_sequence, id);
create index lab_members_status_idx on public.lab_members (lab_id, membership_status, role);

create or replace function public.active_lab_role(target_lab_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select membership.role from public.lab_members membership
  where membership.lab_id = target_lab_id and membership.user_id = auth.uid()
    and membership.membership_status = 'active' limit 1;
$$;

create or replace function public.is_lab_member(target_lab_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.active_lab_role(target_lab_id) is not null; $$;

create function public.is_lab_admin(target_lab_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.active_lab_role(target_lab_id) = 'admin'; $$;

create function public.append_lab_audit(
  target_lab_id uuid, event_name text, target_kind text, target_record_id uuid default null,
  target_record_version_id uuid default null, safe_metadata jsonb default '{}'::jsonb,
  operation_request_id text default null, operation_source_device text default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare event_id uuid;
begin
  insert into public.lab_audit_events (lab_id, actor_user_id, event_type, target_type, target_id, target_version_id, metadata, request_id, source_device_id)
  values (target_lab_id, auth.uid(), event_name, target_kind, target_record_id, target_record_version_id, coalesce(safe_metadata, '{}'::jsonb), operation_request_id, operation_source_device)
  returning id into event_id;
  return event_id;
end;
$$;

create function public.reject_lab_immutable_mutation()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('maxcalc.authorized_lab_purge', true) = 'on' then return old; end if;
  raise exception 'lab publication snapshots and audit events are immutable' using errcode = '55000';
end;
$$;

create trigger lab_versions_immutable before update or delete on public.lab_library_versions
for each row execute function public.reject_lab_immutable_mutation();
create trigger lab_notes_immutable before update or delete on public.lab_publication_notes
for each row execute function public.reject_lab_immutable_mutation();
create trigger lab_audit_immutable before update or delete on public.lab_audit_events
for each row execute function public.reject_lab_immutable_mutation();

create function public.create_private_lab(lab_name text, lab_description text, request_id text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_lab_id uuid; normalized_name text := btrim(lab_name);
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if char_length(normalized_name) not between 1 and 160 then raise exception 'invalid lab name' using errcode = '22023'; end if;
  insert into public.labs (name, description, created_by) values (normalized_name, left(coalesce(lab_description, ''), 4000), auth.uid()) returning id into new_lab_id;
  insert into public.lab_members (lab_id, user_id, role, membership_status, joined_at) values (new_lab_id, auth.uid(), 'admin', 'active', now());
  perform public.append_lab_audit(new_lab_id, 'lab.created', 'lab', new_lab_id, null, jsonb_build_object('name', normalized_name), request_id, null);
  return new_lab_id;
end;
$$;

create function public.create_lab_invitation(
  target_lab_id uuid, normalized_email text, intended_role text, invitation_digest text,
  invitation_expires_at timestamptz, request_id text default null
) returns public.lab_invitations language plpgsql security definer set search_path = ''
as $$
declare result public.lab_invitations; email_value text := lower(btrim(normalized_email));
begin
  if not public.is_lab_admin(target_lab_id) then raise exception 'lab admin required' using errcode = '42501'; end if;
  if intended_role not in ('admin','member','viewer') or invitation_digest !~ '^[0-9a-f]{64}$' or invitation_expires_at <= now() then raise exception 'invalid invitation' using errcode = '22023'; end if;
  insert into public.lab_invitations (lab_id, email_normalized, intended_role, token_digest, invited_by, expires_at)
  values (target_lab_id, email_value, intended_role, invitation_digest, auth.uid(), invitation_expires_at) returning * into result;
  perform public.append_lab_audit(target_lab_id, 'invitation.created', 'invitation', result.id, null, jsonb_build_object('emailDomain', split_part(email_value,'@',2), 'role', intended_role, 'expiresAt', invitation_expires_at), request_id, null);
  return result;
end;
$$;

create function public.revoke_lab_invitation(invitation_id uuid, request_id text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare invitation public.lab_invitations;
begin
  select * into invitation from public.lab_invitations where id = invitation_id for update;
  if not found or not public.is_lab_admin(invitation.lab_id) then raise exception 'invitation not found' using errcode = '42501'; end if;
  if invitation.accepted_at is not null then raise exception 'accepted invitation cannot be revoked' using errcode = '22023'; end if;
  update public.lab_invitations set revoked_at = coalesce(revoked_at, now()) where id = invitation_id;
  perform public.append_lab_audit(invitation.lab_id, 'invitation.revoked', 'invitation', invitation.id, null, '{}'::jsonb, request_id, null);
end;
$$;

create function public.accept_lab_invitation(invitation_digest text, request_id text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare invitation public.lab_invitations; authenticated_email text := lower(coalesce(auth.jwt() ->> 'email',''));
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into invitation from public.lab_invitations where token_digest = invitation_digest for update;
  if not found then raise exception 'invitation not found' using errcode = '22023'; end if;
  if invitation.revoked_at is not null or invitation.expires_at <= now() then raise exception 'invitation expired or revoked' using errcode = '22023'; end if;
  if invitation.email_normalized <> authenticated_email then raise exception 'invitation email does not match authenticated account' using errcode = '42501'; end if;
  if invitation.accepted_at is null then
    insert into public.lab_members (lab_id, user_id, role, membership_status, email_normalized, invited_by, joined_at)
    values (invitation.lab_id, auth.uid(), invitation.intended_role, 'active', authenticated_email, invitation.invited_by, now())
    on conflict (lab_id, user_id) do update set role = excluded.role, membership_status = 'active', email_normalized = excluded.email_normalized, invited_by = excluded.invited_by, joined_at = coalesce(public.lab_members.joined_at, now()), removed_at = null, updated_at = now();
    update public.lab_invitations set accepted_at = now() where id = invitation.id;
    perform public.append_lab_audit(invitation.lab_id, 'invitation.accepted', 'invitation', invitation.id, null, jsonb_build_object('role', invitation.intended_role), request_id, null);
    perform public.append_lab_audit(invitation.lab_id, 'member.joined', 'membership', auth.uid(), null, jsonb_build_object('role', invitation.intended_role), request_id, null);
  end if;
  return invitation.lab_id;
end;
$$;

create function public.manage_lab_member(target_lab_id uuid, target_user_id uuid, requested_role text, requested_status text, request_id text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare current_member public.lab_members; active_admins integer;
begin
  if not public.is_lab_admin(target_lab_id) then raise exception 'lab admin required' using errcode = '42501'; end if;
  select * into current_member from public.lab_members where lab_id = target_lab_id and user_id = target_user_id for update;
  if not found then raise exception 'membership not found' using errcode = '22023'; end if;
  if target_user_id = auth.uid() and (requested_role is distinct from current_member.role or requested_status is distinct from current_member.membership_status) then raise exception 'administrators cannot change their own membership' using errcode = '42501'; end if;
  if requested_role not in ('admin','member','viewer') or requested_status not in ('active','suspended','removed') then raise exception 'invalid membership change' using errcode = '22023'; end if;
  if current_member.role = 'admin' and current_member.membership_status = 'active' and (requested_role <> 'admin' or requested_status <> 'active') then
    select count(*) into active_admins from public.lab_members where lab_id = target_lab_id and role = 'admin' and membership_status = 'active';
    if active_admins <= 1 then raise exception 'the last active lab admin cannot be changed or removed' using errcode = '23000'; end if;
  end if;
  update public.lab_members set role = requested_role, membership_status = requested_status, removed_at = case when requested_status = 'removed' then now() else null end, updated_at = now()
  where lab_id = target_lab_id and user_id = target_user_id;
  perform public.append_lab_audit(target_lab_id, case when requested_status = 'removed' then 'member.removed' when requested_status = 'suspended' then 'member.suspended' else 'member.role_changed' end, 'membership', target_user_id, null, jsonb_build_object('previousRole', current_member.role, 'role', requested_role, 'previousStatus', current_member.membership_status, 'status', requested_status), request_id, null);
end;
$$;

create function public.publish_lab_version(
  target_lab_id uuid, target_entry_id uuid, expected_entry_version bigint,
  publication_title text, publication_description text,
  source_recipe_id uuid, source_revision_id uuid,
  publication_note text, scientific_input jsonb, calculation_snapshot jsonb,
  schema_version text, engine_version text, content_digest text,
  adjusted_feed_formula text, target_formula text, verification_status text, warning_count integer,
  selected_notes jsonb default '[]'::jsonb, acknowledge_target_change boolean default false,
  request_id text default null, source_device_id text default null
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare role_value text := public.active_lab_role(target_lab_id); entry_record public.lab_library_entries; new_entry_id uuid; new_version_id uuid := gen_random_uuid(); next_number integer; current_target text; note_payload jsonb;
begin
  if role_value not in ('admin','member') then raise exception 'publishing role required' using errcode = '42501'; end if;
  if not exists (select 1 from public.recipes r join public.recipe_revisions v on v.recipe_id = r.id and v.owner_id = r.owner_id where r.id = source_recipe_id and v.id = source_revision_id and r.owner_id = auth.uid() and r.deleted_at is null) then raise exception 'personal publication source is not owned by the publisher' using errcode = '42501'; end if;
  if jsonb_typeof(scientific_input) <> 'object' or jsonb_typeof(calculation_snapshot) <> 'object' or btrim(target_formula) = '' then raise exception 'invalid scientific publication payload' using errcode = '22023'; end if;
  if target_entry_id is null then
    insert into public.lab_library_entries (lab_id,title,description,created_by) values (target_lab_id,btrim(publication_title),left(coalesce(publication_description,''),4000),auth.uid()) returning * into entry_record;
    new_entry_id := entry_record.id; next_number := 1;
  else
    select * into entry_record from public.lab_library_entries where id = target_entry_id and lab_id = target_lab_id for update;
    if not found then raise exception 'lab entry not found' using errcode = '22023'; end if;
    if expected_entry_version is null or entry_record.version <> expected_entry_version then raise exception 'stale lab entry metadata version' using errcode = '40001'; end if;
    if role_value = 'member' and entry_record.created_by <> auth.uid() then raise exception 'members may add versions only to entries they created' using errcode = '42501'; end if;
    select v.target_formula into current_target from public.lab_library_versions v where v.id = entry_record.current_version_id;
    if current_target is distinct from target_formula and not acknowledge_target_change then raise exception 'target formula changed; explicit acknowledgement required' using errcode = '22023'; end if;
    select coalesce(max(version_number),0)+1 into next_number from public.lab_library_versions where entry_id = entry_record.id;
    new_entry_id := entry_record.id;
  end if;
  insert into public.lab_library_versions (id,entry_id,lab_id,version_number,source_personal_recipe_id,source_personal_revision_id,published_by,publication_note,scientific_input,calculation_snapshot,schema_version,engine_version,content_digest,adjusted_feed_formula,target_formula,verification_status,warning_count)
  values (new_version_id,new_entry_id,target_lab_id,next_number,source_recipe_id,source_revision_id,auth.uid(),left(coalesce(publication_note,''),4000),scientific_input,calculation_snapshot,schema_version,engine_version,content_digest,adjusted_feed_formula,target_formula,verification_status,warning_count);
  for note_payload in select value from jsonb_array_elements(coalesce(selected_notes,'[]'::jsonb)) loop
    if not exists (select 1 from public.recipe_notes n where n.id = (note_payload ->> 'sourcePersonalNoteId')::uuid and n.owner_id = auth.uid() and n.recipe_id = source_recipe_id and n.deleted_at is null and n.archived_at is null and (n.revision_id is null or n.revision_id = source_revision_id)) then raise exception 'selected publication note is unavailable or private to another source' using errcode = '42501'; end if;
    insert into public.lab_publication_notes (lab_id,entry_id,publication_version_id,source_personal_note_id,category,title,body,tags,experiment_date,published_by,content_digest)
    values (target_lab_id,new_entry_id,new_version_id,(note_payload ->> 'sourcePersonalNoteId')::uuid,note_payload ->> 'category',note_payload ->> 'title',note_payload ->> 'body',coalesce(array(select jsonb_array_elements_text(note_payload -> 'tags')),'{}'),nullif(note_payload ->> 'experimentDate','')::date,auth.uid(),note_payload ->> 'contentDigest');
  end loop;
  update public.lab_library_entries set current_version_id = new_version_id, title = btrim(publication_title), description = left(coalesce(publication_description,''),4000), version = version + case when target_entry_id is null then 0 else 1 end, updated_at = now(), sync_sequence = nextval('public.maxcalc_lab_sync_sequence') where id = new_entry_id;
  perform public.append_lab_audit(target_lab_id, case when next_number = 1 then 'entry.published' else 'publication.version_added' end, 'library-entry', new_entry_id, new_version_id, jsonb_build_object('versionNumber',next_number,'targetFormula',target_formula,'contentDigest',content_digest,'warningCount',warning_count,'selectedNoteCount',jsonb_array_length(coalesce(selected_notes,'[]'::jsonb))), request_id, source_device_id);
  return jsonb_build_object('entryId',new_entry_id,'versionId',new_version_id,'versionNumber',next_number);
end;
$$;

create function public.set_lab_entry_state(target_entry_id uuid, action text, expected_version bigint, hold_reason text default null, request_id text default null)
returns public.lab_library_entries language plpgsql security definer set search_path = ''
as $$
declare entry_record public.lab_library_entries; role_value text; retention_days integer;
begin
  select * into entry_record from public.lab_library_entries where id = target_entry_id for update;
  if not found then raise exception 'lab entry not found' using errcode = '22023'; end if;
  role_value := public.active_lab_role(entry_record.lab_id);
  if action in ('hold','unhold','restore') and role_value <> 'admin' then raise exception 'lab admin required' using errcode = '42501'; end if;
  if action = 'archive' and not (role_value = 'admin' or (role_value = 'member' and entry_record.created_by = auth.uid())) then raise exception 'archive permission denied' using errcode = '42501'; end if;
  if entry_record.version <> expected_version then raise exception 'stale lab entry metadata version' using errcode = '40001'; end if;
  select nullif(retention_policy ->> 'purgeAfterDays','')::integer into retention_days from public.labs where id = entry_record.lab_id;
  if action = 'archive' then update public.lab_library_entries set archived_at=now(),archived_by=auth.uid(),visibility_status='archived',purge_eligible_at=case when retention_days is null then null else now()+make_interval(days=>retention_days) end,version=version+1,updated_at=now(),sync_sequence=nextval('public.maxcalc_lab_sync_sequence') where id=target_entry_id returning * into entry_record;
  elsif action = 'restore' then update public.lab_library_entries set archived_at=null,archived_by=null,visibility_status='active',purge_eligible_at=null,retention_hold_reason=null,version=version+1,updated_at=now(),sync_sequence=nextval('public.maxcalc_lab_sync_sequence') where id=target_entry_id returning * into entry_record;
  elsif action = 'hold' then
    if nullif(btrim(hold_reason),'') is null then raise exception 'retention hold reason is required' using errcode='22023'; end if;
    update public.lab_library_entries set visibility_status='retention-hold',retention_hold_reason=left(btrim(hold_reason),500),version=version+1,updated_at=now(),sync_sequence=nextval('public.maxcalc_lab_sync_sequence') where id=target_entry_id returning * into entry_record;
  elsif action = 'unhold' then update public.lab_library_entries set visibility_status=case when archived_at is null then 'active' else 'archived' end,retention_hold_reason=null,purge_eligible_at=case when archived_at is null or retention_days is null then null else now()+make_interval(days=>retention_days) end,version=version+1,updated_at=now(),sync_sequence=nextval('public.maxcalc_lab_sync_sequence') where id=target_entry_id returning * into entry_record;
  else raise exception 'unsupported entry action' using errcode='22023'; end if;
  perform public.append_lab_audit(entry_record.lab_id,'entry.'||action,'library-entry',entry_record.id,null,jsonb_build_object('visibilityStatus',entry_record.visibility_status,'purgeEligibleAt',entry_record.purge_eligible_at),request_id,null);
  return entry_record;
end;
$$;

create function public.purge_lab_entry(target_entry_id uuid, confirmation_title text, request_id text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare entry_record public.lab_library_entries; version_count integer; note_count integer;
begin
  select * into entry_record from public.lab_library_entries where id=target_entry_id for update;
  if not found or not public.is_lab_admin(entry_record.lab_id) then raise exception 'lab admin required' using errcode='42501'; end if;
  if entry_record.title <> confirmation_title then raise exception 'purge confirmation title does not match' using errcode='22023'; end if;
  if entry_record.visibility_status='retention-hold' then raise exception 'retention hold blocks purge' using errcode='23000'; end if;
  if entry_record.archived_at is null or entry_record.purge_eligible_at is null or entry_record.purge_eligible_at > now() then raise exception 'entry is not eligible for purge' using errcode='23000'; end if;
  select count(*) into version_count from public.lab_library_versions where entry_id=entry_record.id;
  select count(*) into note_count from public.lab_publication_notes where entry_id=entry_record.id;
  perform set_config('maxcalc.authorized_lab_purge','on',true);
  update public.lab_library_entries set current_version_id=null where id=entry_record.id;
  delete from public.lab_publication_notes where entry_id=entry_record.id;
  delete from public.lab_library_versions where entry_id=entry_record.id;
  delete from public.lab_library_entries where id=entry_record.id;
  perform public.append_lab_audit(entry_record.lab_id,'entry.purged','library-entry',entry_record.id,null,jsonb_build_object('title',entry_record.title,'versionCount',version_count,'publicationNoteCount',note_count),request_id,null);
end;
$$;

create function public.update_lab_settings(target_lab_id uuid, lab_name text, lab_description text, retention_days integer, request_id text default null)
returns public.labs language plpgsql security definer set search_path = ''
as $$
declare result public.labs;
begin
  if not public.is_lab_admin(target_lab_id) then raise exception 'lab admin required' using errcode='42501'; end if;
  if retention_days is not null and retention_days not in (30,90,365) then raise exception 'invalid retention policy' using errcode='22023'; end if;
  update public.labs set name=btrim(lab_name),description=left(coalesce(lab_description,''),4000),retention_policy=jsonb_build_object('purgeAfterDays',retention_days),updated_at=now() where id=target_lab_id returning * into result;
  perform public.append_lab_audit(target_lab_id,'lab.settings_changed','lab',target_lab_id,null,jsonb_build_object('retentionDays',retention_days),request_id,null);
  return result;
end;
$$;

create function public.get_lab_sync_high_watermark(target_lab_id uuid)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare sequence_value bigint; sequence_called boolean;
begin
  if not public.is_lab_member(target_lab_id) then raise exception 'active lab membership required' using errcode='42501'; end if;
  select last_value,is_called into sequence_value,sequence_called from public.maxcalc_lab_sync_sequence;
  return (case when sequence_called then sequence_value else 0 end)::text;
end;
$$;

alter table public.lab_invitations enable row level security;
alter table public.lab_library_entries enable row level security;
alter table public.lab_library_versions enable row level security;
alter table public.lab_publication_notes enable row level security;
alter table public.lab_audit_events enable row level security;
alter table public.lab_invitations force row level security;
alter table public.lab_library_entries force row level security;
alter table public.lab_library_versions force row level security;
alter table public.lab_publication_notes force row level security;
alter table public.lab_audit_events force row level security;

drop policy if exists labs_select_for_members on public.labs;
drop policy if exists lab_members_select_for_members on public.lab_members;
create policy labs_select_active_members on public.labs for select to authenticated using (public.is_lab_member(id));
create policy memberships_select_active_members on public.lab_members for select to authenticated using (public.is_lab_member(lab_id));
create policy profiles_select_shared_active_lab on public.profiles for select to authenticated using (
  exists (
    select 1 from public.lab_members mine
    join public.lab_members theirs on theirs.lab_id = mine.lab_id
    where mine.user_id = auth.uid() and mine.membership_status = 'active'
      and theirs.user_id = profiles.user_id and theirs.membership_status = 'active'
  )
);
create policy invitations_select_admin on public.lab_invitations for select to authenticated using (public.is_lab_admin(lab_id));
create policy entries_select_members on public.lab_library_entries for select to authenticated using (public.is_lab_member(lab_id) and (visibility_status='active' or public.active_lab_role(lab_id) in ('admin','member')));
create policy versions_select_members on public.lab_library_versions for select to authenticated using (public.is_lab_member(lab_id) and exists(select 1 from public.lab_library_entries e where e.id=entry_id and e.lab_id=lab_library_versions.lab_id));
create policy notes_select_members on public.lab_publication_notes for select to authenticated using (public.is_lab_member(lab_id));
create policy audit_select_authorized on public.lab_audit_events for select to authenticated using (
  public.active_lab_role(lab_id)='admin' or
  (public.active_lab_role(lab_id)='member' and event_type in ('entry.published','publication.version_added','entry.archive','entry.restore','entry.hold','entry.unhold'))
);

revoke all on table public.lab_invitations,public.lab_library_entries,public.lab_library_versions,public.lab_publication_notes,public.lab_audit_events from public,anon,authenticated;
grant select on table public.lab_invitations,public.lab_library_entries,public.lab_library_versions,public.lab_publication_notes,public.lab_audit_events to authenticated;
revoke all on sequence public.maxcalc_lab_sync_sequence from public,anon,authenticated;

revoke all on function public.active_lab_role(uuid),public.is_lab_admin(uuid),public.append_lab_audit(uuid,text,text,uuid,uuid,jsonb,text,text),public.reject_lab_immutable_mutation(),public.create_private_lab(text,text,text),public.create_lab_invitation(uuid,text,text,text,timestamptz,text),public.revoke_lab_invitation(uuid,text),public.accept_lab_invitation(text,text),public.manage_lab_member(uuid,uuid,text,text,text),public.publish_lab_version(uuid,uuid,bigint,text,text,uuid,uuid,text,jsonb,jsonb,text,text,text,text,text,text,integer,jsonb,boolean,text,text),public.set_lab_entry_state(uuid,text,bigint,text,text),public.purge_lab_entry(uuid,text,text),public.update_lab_settings(uuid,text,text,integer,text),public.get_lab_sync_high_watermark(uuid) from public,anon;
grant execute on function public.create_private_lab(text,text,text),public.create_lab_invitation(uuid,text,text,text,timestamptz,text),public.revoke_lab_invitation(uuid,text),public.accept_lab_invitation(text,text),public.manage_lab_member(uuid,uuid,text,text,text),public.publish_lab_version(uuid,uuid,bigint,text,text,uuid,uuid,text,jsonb,jsonb,text,text,text,text,text,text,integer,jsonb,boolean,text,text),public.set_lab_entry_state(uuid,text,bigint,text,text),public.purge_lab_entry(uuid,text,text),public.update_lab_settings(uuid,text,text,integer,text),public.get_lab_sync_high_watermark(uuid) to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['lab_members','lab_library_entries','lab_library_versions','lab_publication_notes','lab_audit_events']
  loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name) then
      execute format('alter publication supabase_realtime add table public.%I',table_name);
    end if;
  end loop;
end $$;

comment on table public.lab_library_versions is 'Immutable lab-owned publication snapshots; never aliases of personal recipe rows.';
comment on table public.lab_publication_notes is 'Explicitly selected immutable note snapshots. Personal note edits never propagate.';
comment on table public.lab_audit_events is 'Append-only safe lab action history. Full scientific payloads and note bodies are excluded from metadata.';
comment on function public.purge_lab_entry(uuid,text,text) is 'Admin-only explicit eligible purge. Retention holds and eligibility are enforced server-side; a minimal audit tombstone remains.';

commit;
