do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.download_events') is null then
    raise exception 'website account tables are missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.download_events'::regclass) then
    raise exception 'row level security is not enabled';
  end if;
  if public.hook_restrict_signup_by_email_domain(
    '{"user":{"email":"creator@gmail.com"}}'::jsonb
  ) <> '{}'::jsonb then
    raise exception 'allowed signup domain was rejected';
  end if;
  if public.hook_restrict_signup_by_email_domain(
    '{"user":{"email":"creator@temporary.test"}}'::jsonb
  ) -> 'error' is null then
    raise exception 'unapproved signup domain was accepted';
  end if;
end;
$$;
