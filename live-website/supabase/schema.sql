create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.download_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('windows', 'macos', 'linux')),
  version text not null check (char_length(version) between 1 and 32),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.download_events enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.download_events from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert on public.download_events to authenticated;
revoke select on public.download_events from authenticated;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "record own download" on public.download_events;
create policy "record own download" on public.download_events
  for insert to authenticated with check ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', 'Luffy user')), 80));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.hook_restrict_signup_by_email_domain(event jsonb)
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  domain text := lower(split_part(coalesce(event -> 'user' ->> 'email', ''), '@', 2));
begin
  if domain = any (array[
    'gmail.com', 'googlemail.com',
    'yahoo.com', 'yahoo.co.in', 'ymail.com',
    'outlook.com', 'hotmail.com', 'live.com',
    'proton.me', 'protonmail.com', 'pm.me'
  ]) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Use a Gmail, Yahoo, Outlook/Microsoft, or Proton email address.'
  ));
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_restrict_signup_by_email_domain(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup_by_email_domain(jsonb) from anon, authenticated, public;
