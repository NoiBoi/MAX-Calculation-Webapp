begin;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text null check (char_length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.labs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict
);

create table public.lab_members (
  lab_id uuid not null references public.labs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (lab_id, user_id)
);

create index lab_members_user_id_idx on public.lab_members (user_id);

create function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_profile_updated_at();

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    left(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 120)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger create_profile_after_auth_user
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Cover users invited or created before this migration. The trigger covers all
-- later users, while ensure_own_profile remains the partial-failure recovery.
insert into public.profiles (user_id, display_name)
select
  existing.id,
  left(nullif(btrim(existing.raw_user_meta_data ->> 'display_name'), ''), 120)
from auth.users as existing
on conflict (user_id) do nothing;

create function public.ensure_own_profile()
returns setof public.profiles
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.profiles (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  return query
  select profile.*
  from public.profiles as profile
  where profile.user_id = auth.uid();
end;
$$;

-- This helper prevents a recursive lab_members RLS policy. It only returns a
-- yes/no membership answer for the currently authenticated user.
create function public.is_lab_member(target_lab_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lab_members as membership
    where membership.lab_id = target_lab_id
      and membership.user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.labs enable row level security;
alter table public.lab_members enable row level security;
alter table public.profiles force row level security;
alter table public.labs force row level security;
alter table public.lab_members force row level security;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (user_id = auth.uid());

create policy profiles_update_display_name
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy labs_select_for_members
on public.labs
for select
to authenticated
using (public.is_lab_member(id));

create policy lab_members_select_for_members
on public.lab_members
for select
to authenticated
using (public.is_lab_member(lab_id));

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.labs from public, anon, authenticated;
revoke all on table public.lab_members from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select on table public.labs to authenticated;
grant select on table public.lab_members to authenticated;

revoke all on function public.ensure_own_profile() from public, anon;
revoke all on function public.is_lab_member(uuid) from public, anon;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.set_profile_updated_at() from public, anon, authenticated;
grant execute on function public.ensure_own_profile() to authenticated;
grant execute on function public.is_lab_member(uuid) to authenticated;

comment on table public.profiles is 'Private per-user profile metadata; passwords remain exclusively in Supabase Auth.';
comment on table public.labs is 'Lab identity foundation. Ordinary clients have no lab write grants in milestone 1.';
comment on table public.lab_members is 'Lab authorization foundation. Ordinary clients have no membership write grants in milestone 1.';
comment on function public.ensure_own_profile() is 'Idempotently creates and returns only the profile bound to auth.uid().';

commit;
