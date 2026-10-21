-- FindSeek: India-first launch, verified listings, personalised preferences.
--
-- 1. Every listing passes a verification gate before any user sees it: a real hiring source,
--    a full description with qualifications, stated pay, no scam signals, and open to India.
--    The result and its reasons are stored so held-back listings can be explained.
-- 2. Listings carry when they were last seen live at the source, and are closed when they
--    disappear, so users don't tailor CVs for jobs that no longer exist.
-- 3. Users can bring a job they found anywhere (LinkedIn, Instagram, Facebook, WhatsApp...).
--    It goes through the same gate and stays private to them.
-- 4. Profiles hold the preferences Indian job seekers filter on: cities, CTC or stipend,
--    notice period, internships vs full-time, and their own deal-breakers.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
alter table public.profiles alter column country_code set default 'in';

alter table public.profiles
  add column career_stage text check (career_stage in ('student', 'fresher', 'experienced')),
  add column experience_years numeric(4, 1) check (experience_years between 0 and 60),
  add column preferred_cities text[] not null default '{}',
  add column open_to_relocate boolean not null default false,
  add column job_types text[] not null default '{full_time}',
  add column expected_pay_min_inr numeric check (expected_pay_min_inr >= 0), -- annual INR; stipends are stored x12
  add column notice_period_days int check (notice_period_days between 0 and 365),
  add column deal_breakers text[] not null default '{}',              -- e.g. {'service bond', 'night shifts'}
  add column intake_text text;                                          -- what the user wrote in their own words

alter table public.profiles
  add constraint profiles_job_types_valid
  check (job_types <@ array['full_time', 'internship', 'part_time', 'contract', 'apprenticeship']::text[]);

-- ---------------------------------------------------------------------------
-- Jobs: verification, freshness and India facts
-- ---------------------------------------------------------------------------
alter table public.jobs drop constraint jobs_source_check;
alter table public.jobs add constraint jobs_source_check
  check (source in ('adzuna', 'greenhouse', 'lever', 'manual', 'user_submitted'));

alter table public.jobs
  add column dedupe_key text,
  add column verification_status text not null default 'held' check (verification_status in ('verified', 'held')),
  add column verification_checks jsonb not null default '[]',
  add column verified_at timestamptz,
  add column india_eligibility text check (india_eligibility in ('eligible', 'not_eligible', 'unclear')),
  add column cities text[] not null default '{}',
  add column work_mode text check (work_mode in ('remote', 'hybrid', 'onsite')),
  add column job_type text check (job_type in ('full_time', 'internship', 'part_time', 'contract', 'apprenticeship')),
  add column experience_min numeric(4, 1),
  add column experience_max numeric(4, 1),
  add column notice_max_days int,
  add column pay_min_inr numeric,
  add column pay_max_inr numeric,
  add column pay_period text check (pay_period in ('year', 'month')),
  add column pay_text text,
  add column last_seen_at timestamptz not null default now(),
  add column closed_at timestamptz,
  add column repost_count int not null default 0,
  add column submitted_by uuid references auth.users (id) on delete cascade,
  add column seen_on text,     -- where a user found a submitted job: linkedin, instagram, facebook, whatsapp, other
  add column source_url text;  -- the post they found it in (may differ from apply_url)

update public.jobs set last_seen_at = fetched_at;

create index jobs_feed_idx on public.jobs (verification_status, posted_at desc) where closed_at is null;
create index jobs_dedupe_idx on public.jobs (dedupe_key);
create index jobs_submitted_by_idx on public.jobs (submitted_by) where submitted_by is not null;

-- A vacancy that keeps being closed and re-posted under a new id is a ghost-job signal.
create or replace function public.count_reposts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dedupe_key is not null then
    select count(*) into new.repost_count
    from public.jobs
    where dedupe_key = new.dedupe_key and closed_at is not null and id <> new.id;
  end if;
  return new;
end $$;

create trigger jobs_count_reposts before insert on public.jobs
  for each row execute function public.count_reposts();

-- Readers see verified listings from shared sources, their own submissions (verified or
-- held, so they can see why), and anything they've already applied to even after it closes.
drop policy "signed-in users read jobs" on public.jobs;
create policy "read verified, own and applied jobs" on public.jobs
  for select to authenticated using (
    (verification_status = 'verified' and source <> 'user_submitted')
    or submitted_by = auth.uid()
    or exists (select 1 from public.applications a where a.job_id = jobs.id and a.user_id = auth.uid())
  );
-- No insert/update policy: only the server (service role) writes jobs, after verifying them.

-- ---------------------------------------------------------------------------
-- Employer openings must state pay like every other listing
-- ---------------------------------------------------------------------------
alter table public.job_posts
  add column pay_min_inr numeric check (pay_min_inr >= 0),
  add column pay_max_inr numeric check (pay_max_inr >= 0),
  add column pay_period text not null default 'year' check (pay_period in ('year', 'month')),
  add constraint job_posts_pay_range check (pay_max_inr is null or pay_min_inr is null or pay_max_inr >= pay_min_inr);

-- ---------------------------------------------------------------------------
-- Reports from users: closed, fake, wrong pay, not open to India
-- ---------------------------------------------------------------------------
create table public.job_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('closed', 'fake', 'wrong_pay', 'not_india')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (job_id, user_id, reason)
);
create index job_reports_job_idx on public.job_reports (job_id, reason);

alter table public.job_reports enable row level security;
create policy "own reports" on public.job_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Three different people reporting the same problem pulls the listing until it's re-checked.
create or replace function public.act_on_reports() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  reporters int;
begin
  select count(distinct user_id) into reporters
  from public.job_reports where job_id = new.job_id and reason = new.reason;

  if reporters >= 3 then
    if new.reason = 'closed' then
      update public.jobs set closed_at = coalesce(closed_at, now()) where id = new.job_id;
    else
      update public.jobs
      set verification_status = 'held',
          verification_checks = verification_checks || jsonb_build_array(jsonb_build_object(
            'key', 'reports', 'label', 'Not reported by users', 'ok', false,
            'detail', format('%s people reported this listing (%s)', reporters, replace(new.reason, '_', ' '))))
      where id = new.job_id and verification_status = 'verified';
    end if;
  end if;
  return new;
end $$;

create trigger job_reports_act after insert on public.job_reports
  for each row execute function public.act_on_reports();

-- The daily refresh re-verifies listings; it must not quietly re-publish one that users
-- flagged as fake, wrongly paid or not open to India. (A "closed" report is overridden if
-- the employer's own board still lists the job.)
create or replace function public.keep_reported_jobs_held() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  worst record;
begin
  if new.verification_status = 'verified' then
    select reason, count(distinct user_id) as reporters into worst
    from public.job_reports
    where job_id = new.id and reason <> 'closed'
    group by reason
    having count(distinct user_id) >= 3
    order by count(distinct user_id) desc
    limit 1;

    if found then
      new.verification_status := 'held';
      new.verification_checks := new.verification_checks || jsonb_build_array(jsonb_build_object(
        'key', 'reports', 'label', 'Not reported by users', 'ok', false,
        'detail', format('%s people reported this listing (%s)', worst.reporters, replace(worst.reason, '_', ' '))));
    end if;
  end if;
  return new;
end $$;

create trigger jobs_keep_reported_held before update on public.jobs
  for each row execute function public.keep_reported_jobs_held();
