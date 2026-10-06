-- FindSeek: employer (admin) side
-- Employers post openings, set screening criteria, review an explainable AI brief on each
-- applicant, record a HUMAN hiring decision, and send the outcome email.
-- Any user can create an employer account; access to everything below is by membership.

-- ---------------------------------------------------------------------------
-- Fix: the AI audit log had no insert policy, so inserts made with the user's own
-- client were rejected by row level security. Users may now write their own rows.
-- ---------------------------------------------------------------------------
create policy "write own audit log" on public.ai_audit_log
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Employers and who can act for them
-- ---------------------------------------------------------------------------
create table public.employers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.employer_members (
  employer_id uuid not null references public.employers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'recruiter')),
  created_at timestamptz not null default now(),
  primary key (employer_id, user_id)
);
create index employer_members_user_idx on public.employer_members (user_id);

-- Employer's own openings. Publishing mirrors an opening into public.jobs (source 'manual')
-- so candidates find it, get a match score and tailor a CV through the normal job flow.
create table public.job_posts (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.employers (id) on delete cascade,
  job_id uuid unique references public.jobs (id) on delete set null,
  title text not null check (char_length(title) between 2 and 160),
  description text not null check (char_length(description) >= 40),
  location text,
  country_code text,
  remote boolean,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_posts_employer_idx on public.job_posts (employer_id, created_at desc);

-- What the employer wants. Free-text so recruiters can state requirements, restrictions,
-- keywords or questions. The app rejects criteria that target protected characteristics.
--   hard_requirement: a clear miss leads to a "decline" recommendation (e.g. right to work in Germany)
--   must_have:        weighted heavily in the score
--   nice_to_have:     weighted lightly in the score
create table public.screening_criteria (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null references public.job_posts (id) on delete cascade,
  kind text not null check (kind in ('hard_requirement', 'must_have', 'nice_to_have')),
  text text not null check (char_length(text) between 3 and 300),
  created_at timestamptz not null default now()
);
create index screening_criteria_post_idx on public.screening_criteria (job_post_id);

-- ---------------------------------------------------------------------------
-- Applications submitted to an employer through FindSeek
-- ---------------------------------------------------------------------------
create table public.post_applications (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null references public.job_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,
  candidate_name text,
  snapshot jsonb not null,                 -- what the candidate chose to share: location, approved tailored CV, cover letter
  status text not null default 'submitted' check (status in ('submitted', 'screened', 'selected', 'not_selected', 'withdrawn')),
  consent_shared_at timestamptz not null,  -- candidate agreed to share this with the employer
  consent_ai_screening_at timestamptz not null, -- candidate was told AI helps assess it and a person decides
  submitted_at timestamptz not null default now(),
  unique (job_post_id, user_id)
);
create index post_applications_post_idx on public.post_applications (job_post_id, status);

-- The explainable AI brief. A recommendation only: nothing happens to a candidate because of it.
create table public.candidate_screenings (
  id uuid primary key default gen_random_uuid(),
  post_application_id uuid not null unique references public.post_applications (id) on delete cascade,
  score int not null check (score between 0 and 100),
  recommendation text not null check (recommendation in ('advance', 'review', 'decline')),
  criteria_results jsonb not null,         -- [{criterion_id, status, evidence}]
  reasons text[] not null default '{}',    -- how the score and recommendation were reached
  summary text,
  model text not null,
  created_at timestamptz not null default now()
);

-- The human decision (GDPR Art. 22 / UK DUAA: no solely automated hiring decisions).
create table public.hiring_decisions (
  id uuid primary key default gen_random_uuid(),
  post_application_id uuid not null unique references public.post_applications (id) on delete cascade,
  decided_by uuid references auth.users (id) on delete set null,
  decision text not null check (decision in ('selected', 'not_selected')),
  ai_recommendation text check (ai_recommendation in ('advance', 'review', 'decline')),
  note text,                               -- internal; never sent to the candidate
  decided_at timestamptz not null default now()
);

-- One outcome email per application: drafted from a template, edited and sent by a person.
create table public.candidate_emails (
  id uuid primary key default gen_random_uuid(),
  post_application_id uuid not null unique references public.post_applications (id) on delete cascade,
  kind text not null check (kind in ('selected', 'not_selected')),
  subject text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'failed')),
  error text,
  sent_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create trigger job_posts_updated_at before update on public.job_posts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Membership helpers. SECURITY DEFINER so policies can check membership without
-- recursing into the very tables they protect.
-- ---------------------------------------------------------------------------
create or replace function public.is_employer_member(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employer_members m where m.employer_id = eid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_post_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.job_posts p
    join public.employer_members m on m.employer_id = p.employer_id
    where p.id = pid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_application_member(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.post_applications pa
    join public.job_posts p on p.id = pa.job_post_id
    join public.employer_members m on m.employer_id = p.employer_id
    where pa.id = aid and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_employer_member(uuid), public.is_post_member(uuid), public.is_application_member(uuid) from public;
grant execute on function public.is_employer_member(uuid), public.is_post_member(uuid), public.is_application_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.employers enable row level security;
alter table public.employer_members enable row level security;
alter table public.job_posts enable row level security;
alter table public.screening_criteria enable row level security;
alter table public.post_applications enable row level security;
alter table public.candidate_screenings enable row level security;
alter table public.hiring_decisions enable row level security;
alter table public.candidate_emails enable row level security;

-- Employers: members read; the creator can read their new row so the sign-up insert can return it.
create policy "members read employer" on public.employers
  for select using (public.is_employer_member(id) or created_by = auth.uid());
create policy "create own employer" on public.employers
  for insert with check (created_by = auth.uid());
create policy "owners update employer" on public.employers
  for update using (exists (
    select 1 from public.employer_members m where m.employer_id = id and m.user_id = auth.uid() and m.role = 'owner'
  ));

-- Members: you can see your own membership and your colleagues'. The only self-service insert is
-- becoming owner of an employer you just created.
create policy "read own and colleague membership" on public.employer_members
  for select using (user_id = auth.uid() or public.is_employer_member(employer_id));
create policy "creator becomes owner" on public.employer_members
  for insert with check (
    user_id = auth.uid() and role = 'owner'
    and exists (select 1 from public.employers e where e.id = employer_id and e.created_by = auth.uid())
  );

-- Posts: members manage; signed-in candidates see open posts, and posts they applied to.
create policy "members manage posts" on public.job_posts
  for all using (public.is_employer_member(employer_id)) with check (public.is_employer_member(employer_id));
create policy "candidates read open posts" on public.job_posts
  for select to authenticated using (
    status = 'open'
    or exists (select 1 from public.post_applications pa where pa.job_post_id = id and pa.user_id = auth.uid())
  );

-- Criteria: members only. Candidates never see how they are assessed beyond their own export.
create policy "members manage criteria" on public.screening_criteria
  for all using (public.is_post_member(job_post_id)) with check (public.is_post_member(job_post_id));

-- Applications: the candidate owns theirs; members of the employer can read and update status.
create policy "candidate reads own applications" on public.post_applications
  for select using (user_id = auth.uid());
create policy "candidate submits own application" on public.post_applications
  for insert with check (
    user_id = auth.uid()
    and status = 'submitted'
    and exists (select 1 from public.job_posts p where p.id = job_post_id and p.status = 'open')
  );
create policy "members read applications" on public.post_applications
  for select using (public.is_post_member(job_post_id));
create policy "members update applications" on public.post_applications
  for update using (public.is_post_member(job_post_id)) with check (public.is_post_member(job_post_id));

-- Column-level limits. Row policies can't say which columns may change, so grants do:
--  * Only the status of an application can be updated through a user session (recruiters move it
--    to selected / not_selected). Candidates can't update at all; they withdraw through the function below.
--  * A post's mirror link to public.jobs and its publish time are written only by the server
--    (service role) when it publishes, so a recruiter can't attach a post to someone else's job.
revoke update on public.post_applications from authenticated;
grant update (status) on public.post_applications to authenticated;

revoke insert, update on public.job_posts from authenticated;
grant insert (employer_id, title, description, location, country_code, remote) on public.job_posts to authenticated;
grant update (title, description, location, country_code, remote, status) on public.job_posts to authenticated;

create or replace function public.withdraw_post_application(pid uuid) returns void
language sql security definer set search_path = public as $$
  update public.post_applications
  set status = 'withdrawn'
  where job_post_id = pid and user_id = auth.uid() and status in ('submitted', 'screened');
$$;
revoke all on function public.withdraw_post_application(uuid) from public;
grant execute on function public.withdraw_post_application(uuid) to authenticated;

-- Briefs, decisions and emails: members manage. Candidates may read their own brief and decision
-- (data-subject access); the app exports them in the privacy centre.
create policy "members manage screenings" on public.candidate_screenings
  for all using (public.is_application_member(post_application_id)) with check (public.is_application_member(post_application_id));
create policy "candidate reads own screening" on public.candidate_screenings
  for select using (exists (
    select 1 from public.post_applications pa where pa.id = post_application_id and pa.user_id = auth.uid()
  ));

create policy "members manage decisions" on public.hiring_decisions
  for all using (public.is_application_member(post_application_id)) with check (public.is_application_member(post_application_id));
create policy "candidate reads own decision" on public.hiring_decisions
  for select using (exists (
    select 1 from public.post_applications pa where pa.id = post_application_id and pa.user_id = auth.uid()
  ));

create policy "members manage emails" on public.candidate_emails
  for all using (public.is_application_member(post_application_id)) with check (public.is_application_member(post_application_id));
