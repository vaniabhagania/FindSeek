-- Reports from users now carry a weight, and a person reviews what they pull.
--
-- Before: any three signed-in accounts reporting the same problem pulled a listing from every
-- feed, with no check on who they were. Three throwaway accounts could take down an employer's
-- opening, and a user could "report" a listing they could not even see.
--
-- Now:
--   * each report is weighted by how established the reporter is (account age, onboarding done,
--     has applied to something, and whether their earlier reports were upheld or dismissed);
--   * a listing is pulled automatically only when at least three different people reported the
--     same problem AND their weights add up to 4 or more (three people who have each set up their
--     profile come to 4.5; three accounts that merely waited a week come to 3);
--   * everything else waits in a review queue for an operator, who confirms (listing pulled,
--     reporters credited) or dismisses (listing restored, reporters' trust lowered);
--   * you can only report a listing you can see, and at most 30 reports a day.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.job_reports
  add column weight numeric not null default 0 check (weight >= 0 and weight <= 2),
  add column status text not null default 'open' check (status in ('open', 'confirmed', 'dismissed')),
  add column reviewed_at timestamptz;

-- Reports made before this migration were all equal and three of them pulled a listing. Give each the
-- weight of an established reporter so three old reports still add up to the new threshold.
update public.job_reports set weight = 1.5;

create index job_reports_open_idx on public.job_reports (job_id, reason) where status = 'open';
create index job_reports_user_day_idx on public.job_reports (user_id, created_at);

-- ---------------------------------------------------------------------------
-- How much a reporter's word counts
-- ---------------------------------------------------------------------------
create or replace function public.reporter_weight(p_user uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  created timestamptz;
  w numeric := 0;
  upheld int;
  dismissed int;
begin
  select u.created_at into created from auth.users u where u.id = p_user;
  if created is null then return 0; end if;

  if created <= now() - interval '7 days' then w := w + 1;
  elsif created <= now() - interval '1 day' then w := w + 0.5;
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user and p.onboarding_completed_at is not null) then w := w + 0.5; end if;
  if exists (select 1 from public.applications a where a.user_id = p_user) then w := w + 0.5; end if;

  select count(*) filter (where r.status = 'confirmed'), count(*) filter (where r.status = 'dismissed')
    into upheld, dismissed
  from public.job_reports r where r.user_id = p_user;
  w := w + least(upheld, 2) * 0.25 - least(dismissed, 4) * 0.5;

  return greatest(0, least(2, w));
end $$;

-- ---------------------------------------------------------------------------
-- What a person may do with a report
-- ---------------------------------------------------------------------------
drop policy "own reports" on public.job_reports;

-- See your own reports. Write only your own, and only about a listing you can see (the
-- subquery on jobs runs under the same row level security as the reader).
create policy "read own reports" on public.job_reports
  for select to authenticated using (auth.uid() = user_id);
create policy "report a listing you can see" on public.job_reports
  for insert to authenticated with check (
    auth.uid() = user_id
    and status = 'open'
    and exists (select 1 from public.jobs j where j.id = job_id)
  );
-- No update or delete for readers: taking a report back would let someone report, pull the
-- listing, then delete the evidence.

-- The server decides the weight and the status; whatever the client sends is replaced. Also a
-- daily limit, so one account cannot spray reports across the whole feed.
create or replace function public.prepare_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.job_reports r where r.user_id = new.user_id and r.created_at > now() - interval '24 hours') >= 30 then
    raise exception 'daily report limit reached' using errcode = 'P0001';
  end if;
  new.weight := public.reporter_weight(new.user_id);
  new.status := 'open';
  new.reviewed_at := null;
  return new;
end $$;

create trigger job_reports_prepare before insert on public.job_reports
  for each row execute function public.prepare_report();

-- ---------------------------------------------------------------------------
-- When a listing is pulled
-- ---------------------------------------------------------------------------
-- Reports that still count for a listing and reason: not dismissed by a reviewer.
create or replace function public.report_tally(p_job uuid, p_reason text, out reporters int, out total_weight numeric, out upheld boolean)
language sql stable security definer set search_path = public as $$
  select count(distinct r.user_id)::int,
         coalesce(sum(r.weight), 0),
         coalesce(bool_or(r.status = 'confirmed'), false)
  from public.job_reports r
  where r.job_id = p_job and r.reason = p_reason and r.status <> 'dismissed'
$$;

create or replace function public.act_on_reports() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t record;
  src text;
begin
  select j.source into src from public.jobs j where j.id = new.job_id;
  -- A job someone brought in themselves is visible to them alone; reports cannot pull it from anyone.
  if src is null or src = 'user_submitted' then return new; end if;

  select * into t from public.report_tally(new.job_id, new.reason);
  if t.upheld or (t.reporters >= 3 and t.total_weight >= 4) then
    if new.reason = 'closed' then
      update public.jobs set closed_at = coalesce(closed_at, now()) where id = new.job_id;
    else
      update public.jobs
      set verification_status = 'held',
          verification_checks = verification_checks || jsonb_build_array(jsonb_build_object(
            'key', 'reports', 'label', 'Not reported by users', 'ok', false,
            'detail', format('%s people reported this listing (%s)', t.reporters, replace(new.reason, '_', ' '))))
      where id = new.job_id and verification_status = 'verified';
    end if;
  end if;
  return new;
end $$;

-- The daily refresh re-verifies listings; it must not quietly re-publish one that counted reports
-- still hold back. (A "closed" report is overridden if the employer's own board still lists the job.)
create or replace function public.keep_reported_jobs_held() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  reason text;
  t record;
begin
  if new.verification_status = 'verified' and new.source <> 'user_submitted' then
    foreach reason in array array['fake', 'wrong_pay', 'not_india'] loop
      select * into t from public.report_tally(new.id, reason);
      if t.upheld or (t.reporters >= 3 and t.total_weight >= 4) then
        new.verification_status := 'held';
        new.verification_checks := new.verification_checks || jsonb_build_array(jsonb_build_object(
          'key', 'reports', 'label', 'Not reported by users', 'ok', false,
          'detail', format('%s people reported this listing (%s)', t.reporters, replace(reason, '_', ' '))));
        exit;
      end if;
    end loop;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- The review queue
-- ---------------------------------------------------------------------------
-- Called by the server for an operator (never by a signed-in user): confirm or dismiss every open
-- report for one listing and reason. Confirming pulls the listing (closes it, for "closed");
-- dismissing lowers the reporters' weight and, if the reports were the only thing holding the
-- listing back, puts it back in the feed.
create or replace function public.resolve_job_reports(p_job uuid, p_reason text, p_decision text) returns text
language plpgsql security definer set search_path = public as $$
declare
  remaining jsonb;
  src text;
begin
  if p_decision not in ('confirm', 'dismiss') or p_reason not in ('closed', 'fake', 'wrong_pay', 'not_india') then
    raise exception 'bad decision' using errcode = '22023';
  end if;
  select j.source into src from public.jobs j where j.id = p_job;
  if src is null then raise exception 'unknown listing' using errcode = 'P0002'; end if;

  update public.job_reports
  set status = case when p_decision = 'confirm' then 'confirmed' else 'dismissed' end, reviewed_at = now()
  where job_id = p_job and reason = p_reason and status = 'open';

  if p_decision = 'confirm' then
    if p_reason = 'closed' then
      update public.jobs set closed_at = coalesce(closed_at, now()) where id = p_job;
    elsif src <> 'user_submitted' then
      update public.jobs
      set verification_status = 'held',
          verification_checks = (select coalesce(jsonb_agg(c), '[]'::jsonb) from jsonb_array_elements(verification_checks) c where c ->> 'key' <> 'reports')
            || jsonb_build_array(jsonb_build_object(
              'key', 'reports', 'label', 'Not reported by users', 'ok', false,
              'detail', format('Reported as %s and confirmed on review', replace(p_reason, '_', ' '))))
      where id = p_job;
    end if;
    return 'pulled';
  end if;

  -- Dismissed: drop the reports check, and restore the listing if every other check passed.
  select coalesce(jsonb_agg(c), '[]'::jsonb) into remaining
  from public.jobs j, jsonb_array_elements(j.verification_checks) c
  where j.id = p_job and c ->> 'key' <> 'reports';
  update public.jobs
  set verification_checks = remaining,
      verification_status = case
        when jsonb_array_length(remaining) > 0 and not exists (select 1 from jsonb_array_elements(remaining) c where (c ->> 'ok')::boolean is not true)
        then 'verified' else verification_status end
  where id = p_job;
  return 'restored';
end $$;

-- The review queue itself: one row per listing and reason with reports still waiting.
create or replace function public.report_queue() returns table (
  job_id uuid, reason text, reporters int, total_weight numeric, newest timestamptz, notes text[]
)
language sql stable security definer set search_path = public as $$
  select r.job_id, r.reason, count(distinct r.user_id)::int, sum(r.weight), max(r.created_at),
         array_remove(array_agg(r.note order by r.created_at desc), null)
  from public.job_reports r
  where r.status = 'open'
  group by r.job_id, r.reason
  order by sum(r.weight) desc, max(r.created_at) desc
  limit 200
$$;

-- Postgres lets everyone call a new function; the review functions are for the server only.
revoke all on function public.reporter_weight(uuid) from public, anon, authenticated;
revoke all on function public.report_tally(uuid, text) from public, anon, authenticated;
revoke all on function public.prepare_report() from public, anon, authenticated;
revoke all on function public.act_on_reports() from public, anon, authenticated;
revoke all on function public.keep_reported_jobs_held() from public, anon, authenticated;
revoke all on function public.resolve_job_reports(uuid, text, text) from public, anon, authenticated;
revoke all on function public.report_queue() from public, anon, authenticated;
grant execute on function public.resolve_job_reports(uuid, text, text) to service_role;
grant execute on function public.report_queue() to service_role;
