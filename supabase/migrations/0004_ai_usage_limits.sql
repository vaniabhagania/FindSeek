-- Daily limits on the actions that call the paid AI model.
--
-- Every signed-in user could repeat "Bring a job", the onboarding read, "Find new matches" and
-- "Tailor my CV" as often as they liked, each one a billed call. The server now takes one unit from
-- a per-user, per-action, per-day counter before it calls the model. The count lives here so it
-- holds across servers and restarts, and the increment is a single statement so two clicks at the
-- same moment cannot both slip under the limit.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action ~ '^[a-z_]{1,40}$'),
  day date not null default ((now() at time zone 'Asia/Kolkata')::date),
  used integer not null default 0 check (used >= 0),
  primary key (user_id, action, day)
);

alter table public.ai_usage enable row level security;

-- People can see their own counts. Nobody can write them directly: only take_ai_quota() does.
create policy "read own ai usage" on public.ai_usage
  for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.ai_usage from anon, authenticated;

-- Takes one unit for the signed-in user. Returns true when the action may go ahead, false when
-- today's limit is used up (or nobody is signed in). The limit comes from the server's code, so a
-- caller who invents a higher number only uses up their own allowance faster.
create or replace function public.take_ai_quota(p_action text, p_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  taken integer;
begin
  if uid is null or p_limit is null or p_limit < 1 or p_limit > 1000 then
    return false;
  end if;
  if p_action is null or p_action !~ '^[a-z_]{1,40}$' then
    return false;
  end if;

  insert into public.ai_usage as u (user_id, action, day, used)
  values (uid, p_action, (now() at time zone 'Asia/Kolkata')::date, 1)
  on conflict (user_id, action, day)
    do update set used = u.used + 1 where u.used < p_limit
  returning u.used into taken;

  return taken is not null;
end $$;

revoke all on function public.take_ai_quota(text, integer) from public, anon;
grant execute on function public.take_ai_quota(text, integer) to authenticated;

-- Old counts are of no use after a week.
create index if not exists ai_usage_day_idx on public.ai_usage (day);
