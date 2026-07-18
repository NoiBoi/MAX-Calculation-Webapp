-- Remote changes are notification hints only. The client always performs an
-- authenticated server pull before validating and merging any record.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['recipes', 'recipe_revisions', 'recipe_notes', 'comparisons', 'user_settings']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;

comment on publication supabase_realtime is
  'MAXCalc uses account-scoped change events only as hints that trigger its authoritative pull and merge engine.';
