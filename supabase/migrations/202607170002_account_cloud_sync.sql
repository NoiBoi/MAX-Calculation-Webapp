begin;

create sequence public.maxcalc_sync_sequence as bigint;

create table public.recipes (
  id uuid primary key,
  local_record_id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 240),
  target_formula text not null default '',
  description text not null default '',
  tags text[] not null default '{}',
  current_revision_id uuid null,
  archived_at timestamptz null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version >= 1),
  deleted_at timestamptz null,
  sync_sequence bigint not null default 0,
  source_installation_id text null,
  unique (owner_id, local_record_id),
  unique (owner_id, id)
);

create table public.recipe_revisions (
  id uuid primary key,
  local_record_id text not null,
  recipe_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  scientific_input jsonb not null,
  calculation_snapshot jsonb not null,
  schema_version text not null,
  engine_version text not null,
  revision_note text null,
  created_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  content_digest text not null,
  sync_sequence bigint not null default 0,
  source_installation_id text null,
  unique (owner_id, local_record_id),
  unique (recipe_id, revision_number),
  unique (owner_id, recipe_id, id),
  foreign key (owner_id, recipe_id) references public.recipes(owner_id, id) on delete restrict
);

alter table public.recipes
  add constraint recipes_current_revision_owner_fk
  foreign key (owner_id, id, current_revision_id)
  references public.recipe_revisions(owner_id, recipe_id, id)
  deferrable initially immediate;

create table public.recipe_notes (
  id uuid primary key,
  local_record_id text not null,
  recipe_id uuid not null,
  revision_id uuid null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (char_length(btrim(category)) between 1 and 120),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(body) <= 20000),
  tags text[] not null default '{}',
  experiment_date date null,
  operator text null check (operator is null or char_length(operator) <= 160),
  archived_at timestamptz null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version >= 1),
  deleted_at timestamptz null,
  sync_sequence bigint not null default 0,
  source_installation_id text null,
  unique (owner_id, local_record_id),
  unique (owner_id, id),
  foreign key (owner_id, recipe_id) references public.recipes(owner_id, id) on delete restrict,
  foreign key (owner_id, recipe_id, revision_id)
    references public.recipe_revisions(owner_id, recipe_id, id) on delete restrict
);

create table public.comparisons (
  id uuid primary key,
  local_record_id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 240),
  comparison_data jsonb not null,
  schema_version text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version >= 1),
  deleted_at timestamptz null,
  sync_sequence bigint not null default 0,
  source_installation_id text null,
  unique (owner_id, local_record_id),
  unique (owner_id, id)
);

create table public.user_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  settings_data jsonb not null,
  schema_version text not null,
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version >= 1),
  sync_sequence bigint not null default 0,
  source_installation_id text null
);

create table public.user_devices (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  installation_id text not null check (char_length(installation_id) between 1 and 200),
  display_name text null check (display_name is null or char_length(display_name) <= 120),
  last_sync_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, installation_id),
  unique (owner_id, id)
);

create index recipes_owner_sync_idx on public.recipes (owner_id, sync_sequence, id);
create index recipe_revisions_owner_sync_idx on public.recipe_revisions (owner_id, sync_sequence, id);
create index recipe_notes_owner_sync_idx on public.recipe_notes (owner_id, sync_sequence, id);
create index comparisons_owner_sync_idx on public.comparisons (owner_id, sync_sequence, id);

create function public.assign_maxcalc_sync_sequence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sync_sequence := nextval('public.maxcalc_sync_sequence');
  return new;
end;
$$;

create function public.bump_maxcalc_mutable_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id or new.id is distinct from old.id then
    raise exception 'record ownership and identity are immutable' using errcode = '42501';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  new.sync_sequence := nextval('public.maxcalc_sync_sequence');
  return new;
end;
$$;

create function public.bump_maxcalc_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'settings ownership is immutable' using errcode = '42501';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  new.sync_sequence := nextval('public.maxcalc_sync_sequence');
  return new;
end;
$$;

create function public.reject_recipe_revision_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'recipe revisions are immutable' using errcode = '55000';
end;
$$;

create trigger recipes_sequence_before_insert before insert on public.recipes
for each row execute function public.assign_maxcalc_sync_sequence();
create trigger recipe_revisions_sequence_before_insert before insert on public.recipe_revisions
for each row execute function public.assign_maxcalc_sync_sequence();
create trigger recipe_notes_sequence_before_insert before insert on public.recipe_notes
for each row execute function public.assign_maxcalc_sync_sequence();
create trigger comparisons_sequence_before_insert before insert on public.comparisons
for each row execute function public.assign_maxcalc_sync_sequence();
create trigger user_settings_sequence_before_insert before insert on public.user_settings
for each row execute function public.assign_maxcalc_sync_sequence();

create trigger recipes_bump_before_update before update on public.recipes
for each row execute function public.bump_maxcalc_mutable_record();
create trigger recipe_notes_bump_before_update before update on public.recipe_notes
for each row execute function public.bump_maxcalc_mutable_record();
create trigger comparisons_bump_before_update before update on public.comparisons
for each row execute function public.bump_maxcalc_mutable_record();
create trigger user_settings_bump_before_update before update on public.user_settings
for each row execute function public.bump_maxcalc_settings();
create trigger recipe_revisions_reject_update before update or delete on public.recipe_revisions
for each row execute function public.reject_recipe_revision_mutation();

create function public.get_maxcalc_sync_high_watermark()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sequence_value bigint;
  sequence_called boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select last_value, is_called into sequence_value, sequence_called
  from public.maxcalc_sync_sequence;
  return (case when sequence_called then sequence_value else 0 end)::text;
end;
$$;

create function public.apply_recipe_bundle(
  recipe_payload jsonb,
  revision_payloads jsonb,
  expected_version bigint default null
)
returns public.recipes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  requested_recipe_id uuid := (recipe_payload ->> 'id')::uuid;
  requested_current_revision_id uuid := (recipe_payload ->> 'current_revision_id')::uuid;
  existing public.recipes;
  recipe_is_idempotent boolean := false;
  revision_payload jsonb;
  existing_revision public.recipe_revisions;
  result public.recipes;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(revision_payloads) <> 'array' or jsonb_array_length(revision_payloads) = 0 then
    raise exception 'a recipe bundle requires immutable revisions' using errcode = '22023';
  end if;

  select * into existing from public.recipes
  where id = requested_recipe_id and owner_id = current_user_id
  for update;

  if found and expected_version is not null and existing.version <> expected_version then
    raise exception 'optimistic version conflict' using errcode = '40001';
  elsif found and expected_version is null then
    if existing.local_record_id = recipe_payload ->> 'local_record_id'
      and existing.name = recipe_payload ->> 'name'
      and existing.target_formula = coalesce(recipe_payload ->> 'target_formula', '')
      and existing.description = coalesce(recipe_payload ->> 'description', '')
      and to_jsonb(existing.tags) = coalesce(recipe_payload -> 'tags', '[]'::jsonb)
      and existing.current_revision_id = requested_current_revision_id
      and existing.archived_at is not distinct from nullif(recipe_payload ->> 'archived_at', '')::timestamptz
      and existing.deleted_at is not distinct from nullif(recipe_payload ->> 'deleted_at', '')::timestamptz then
      recipe_is_idempotent := true;
    else
      raise exception 'stable recipe ID already exists with different content' using errcode = '40001';
    end if;
  elsif not found and expected_version is not null then
    raise exception 'expected recipe does not exist' using errcode = '40001';
  end if;

  if not found then
    insert into public.recipes (
      id, local_record_id, owner_id, name, target_formula, description, tags,
      current_revision_id, archived_at, created_at, updated_at, deleted_at, source_installation_id
    ) values (
      requested_recipe_id,
      recipe_payload ->> 'local_record_id',
      current_user_id,
      recipe_payload ->> 'name',
      coalesce(recipe_payload ->> 'target_formula', ''),
      coalesce(recipe_payload ->> 'description', ''),
      coalesce(array(select jsonb_array_elements_text(recipe_payload -> 'tags')), '{}'),
      null,
      nullif(recipe_payload ->> 'archived_at', '')::timestamptz,
      (recipe_payload ->> 'created_at')::timestamptz,
      now(),
      nullif(recipe_payload ->> 'deleted_at', '')::timestamptz,
      recipe_payload ->> 'source_installation_id'
    );
  end if;

  for revision_payload in select value from jsonb_array_elements(revision_payloads)
  loop
    select * into existing_revision from public.recipe_revisions
    where id = (revision_payload ->> 'id')::uuid;
    if found then
      if existing_revision.owner_id <> current_user_id
        or existing_revision.recipe_id <> requested_recipe_id
        or existing_revision.content_digest <> revision_payload ->> 'content_digest'
        or existing_revision.local_record_id <> revision_payload ->> 'local_record_id'
        or existing_revision.revision_number <> (revision_payload ->> 'revision_number')::integer
        or existing_revision.scientific_input <> revision_payload -> 'scientific_input'
        or existing_revision.calculation_snapshot <> revision_payload -> 'calculation_snapshot'
        or existing_revision.schema_version <> revision_payload ->> 'schema_version'
        or existing_revision.engine_version <> revision_payload ->> 'engine_version'
        or existing_revision.revision_note is distinct from nullif(revision_payload ->> 'revision_note', '')
        or existing_revision.created_at <> (revision_payload ->> 'created_at')::timestamptz then
        raise exception 'scientific revision integrity conflict' using errcode = '23000';
      end if;
    else
      insert into public.recipe_revisions (
        id, local_record_id, recipe_id, owner_id, revision_number, scientific_input,
        calculation_snapshot, schema_version, engine_version, revision_note, created_at,
        created_by, content_digest, source_installation_id
      ) values (
        (revision_payload ->> 'id')::uuid,
        revision_payload ->> 'local_record_id',
        requested_recipe_id,
        current_user_id,
        (revision_payload ->> 'revision_number')::integer,
        revision_payload -> 'scientific_input',
        revision_payload -> 'calculation_snapshot',
        revision_payload ->> 'schema_version',
        revision_payload ->> 'engine_version',
        nullif(revision_payload ->> 'revision_note', ''),
        (revision_payload ->> 'created_at')::timestamptz,
        current_user_id,
        revision_payload ->> 'content_digest',
        revision_payload ->> 'source_installation_id'
      );
    end if;
  end loop;

  if recipe_is_idempotent then
    select * into result from public.recipes
    where id = requested_recipe_id and owner_id = current_user_id;
    return result;
  end if;

  update public.recipes set
    name = recipe_payload ->> 'name',
    target_formula = coalesce(recipe_payload ->> 'target_formula', ''),
    description = coalesce(recipe_payload ->> 'description', ''),
    tags = coalesce(array(select jsonb_array_elements_text(recipe_payload -> 'tags')), '{}'),
    current_revision_id = requested_current_revision_id,
    archived_at = nullif(recipe_payload ->> 'archived_at', '')::timestamptz,
    deleted_at = nullif(recipe_payload ->> 'deleted_at', '')::timestamptz,
    source_installation_id = recipe_payload ->> 'source_installation_id'
  where id = requested_recipe_id and owner_id = current_user_id
  returning * into result;

  return result;
end;
$$;

alter table public.recipes enable row level security;
alter table public.recipe_revisions enable row level security;
alter table public.recipe_notes enable row level security;
alter table public.comparisons enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_devices enable row level security;
alter table public.recipes force row level security;
alter table public.recipe_revisions force row level security;
alter table public.recipe_notes force row level security;
alter table public.comparisons force row level security;
alter table public.user_settings force row level security;
alter table public.user_devices force row level security;

create policy recipes_select_own on public.recipes for select to authenticated
using (owner_id = (select auth.uid()));
create policy recipes_insert_own on public.recipes for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy recipes_update_own on public.recipes for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy recipe_revisions_select_own on public.recipe_revisions for select to authenticated
using (owner_id = (select auth.uid()));
create policy recipe_revisions_insert_own on public.recipe_revisions for insert to authenticated
with check (owner_id = (select auth.uid()) and created_by = (select auth.uid()));

create policy recipe_notes_select_own on public.recipe_notes for select to authenticated
using (owner_id = (select auth.uid()));
create policy recipe_notes_insert_own on public.recipe_notes for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy recipe_notes_update_own on public.recipe_notes for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy comparisons_select_own on public.comparisons for select to authenticated
using (owner_id = (select auth.uid()));
create policy comparisons_insert_own on public.comparisons for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy comparisons_update_own on public.comparisons for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy user_settings_select_own on public.user_settings for select to authenticated
using (owner_id = (select auth.uid()));
create policy user_settings_insert_own on public.user_settings for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy user_settings_update_own on public.user_settings for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy user_devices_select_own on public.user_devices for select to authenticated
using (owner_id = (select auth.uid()));
create policy user_devices_insert_own on public.user_devices for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy user_devices_update_own on public.user_devices for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

revoke all on table public.recipes, public.recipe_revisions, public.recipe_notes, public.comparisons, public.user_settings, public.user_devices from public, anon, authenticated;
grant select, insert on public.recipes, public.recipe_revisions, public.recipe_notes, public.comparisons, public.user_settings, public.user_devices to authenticated;
grant update (name, target_formula, description, tags, current_revision_id, archived_at, deleted_at, source_installation_id) on public.recipes to authenticated;
grant update (category, title, body, tags, experiment_date, operator, archived_at, deleted_at, source_installation_id) on public.recipe_notes to authenticated;
grant update (name, comparison_data, schema_version, deleted_at, source_installation_id) on public.comparisons to authenticated;
grant update (settings_data, schema_version, source_installation_id) on public.user_settings to authenticated;
grant update (display_name, last_sync_at, updated_at) on public.user_devices to authenticated;

revoke all on sequence public.maxcalc_sync_sequence from public, anon, authenticated;
revoke all on function public.assign_maxcalc_sync_sequence() from public, anon, authenticated;
revoke all on function public.bump_maxcalc_mutable_record() from public, anon, authenticated;
revoke all on function public.bump_maxcalc_settings() from public, anon, authenticated;
revoke all on function public.reject_recipe_revision_mutation() from public, anon, authenticated;
revoke all on function public.get_maxcalc_sync_high_watermark() from public, anon;
revoke all on function public.apply_recipe_bundle(jsonb, jsonb, bigint) from public, anon;
grant execute on function public.get_maxcalc_sync_high_watermark() to authenticated;
grant execute on function public.apply_recipe_bundle(jsonb, jsonb, bigint) to authenticated;

comment on table public.recipe_revisions is 'Immutable scientific history. UPDATE and DELETE are rejected by trigger and not granted to authenticated clients.';
comment on column public.recipes.local_record_id is 'Stable IndexedDB identity preserved across devices; cloud UUID remains the relational primary key.';
comment on function public.get_maxcalc_sync_high_watermark() is 'Server-derived monotonic cursor. Clients pull rows with sync_sequence greater than their previous cursor and not beyond this token.';
comment on function public.apply_recipe_bundle(jsonb, jsonb, bigint) is 'Atomically inserts immutable revisions and advances recipe metadata using optimistic concurrency.';

commit;
