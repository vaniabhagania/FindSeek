-- FindSeek: job seeker side (Phase 0/1)
-- Every table is owned by a single auth user and protected by row level security.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles: one row per user, filled during the AI onboarding interview
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  headline text,
  location text,
  country_code text,                      -- ISO 3166-1 alpha-2, e.g. 'gb'
  domains text[] not null default '{}',   -- e.g. {'software engineering'}
  interests text[] not null default '{}',
  target_roles text[] not null default '{}',
  remote_preference text check (remote_preference in ('remote', 'hybrid', 'onsite', 'any')) default 'any',
  min_match_score int not null default 60 check (min_match_score between 0 and 100),
  monthly_application_cap int not null default 40 check (monthly_application_cap between 1 and 200),
  onboarding_completed_at timestamptz,
  consent_ai_processing_at timestamptz,   -- explicit consent before any CV goes to the AI
  consent_outcome_analytics_at timestamptz, -- opt-in: use outcomes to improve tailoring
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Verified facts: the ONLY material the tailoring step may use.
-- Parsed from the uploaded CV, then confirmed by the user.
-- ---------------------------------------------------------------------------
create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('work', 'education', 'project', 'certification', 'volunteering')),
  organisation text not null,
  title text not null,
  location text,
  start_date date,
  end_date date,                           -- null = current
  bullets text[] not null default '{}',
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  level text check (level in ('beginner', 'intermediate', 'advanced', 'expert')),
  years numeric(4, 1),
  confirmed boolean not null default false,
  unique (user_id, name)
);

create table public.cv_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,              -- bucket 'cvs', path '<user_id>/<file>'
  original_filename text,
  parsed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Jobs: shared, normalised listings pulled from legal sources.
-- Readable by every signed-in user, written only by the server (service role).
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('adzuna', 'greenhouse', 'lever', 'manual')),
  external_id text not null,
  company text not null,
  title text not null,
  location text,
  country_code text,
  remote boolean,
  description text not null,
  apply_url text not null,
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  posted_at timestamptz,
  fetched_at timestamptz not null default now(),
  scam_flags text[] not null default '{}',
  unique (source, external_id)
);
create index jobs_posted_at_idx on public.jobs (posted_at desc);

-- ---------------------------------------------------------------------------
-- Matches: AI score of one job against one user's verified profile
-- ---------------------------------------------------------------------------
create table public.job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  score int not null check (score between 0 and 100),
  strengths text[] not null default '{}',
  gaps text[] not null default '{}',
  summary text,
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, job_id)
);

-- ---------------------------------------------------------------------------
-- Applications + the tailored documents behind them
-- ---------------------------------------------------------------------------
create type public.application_status as enum (
  'saved', 'tailoring', 'ready', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete restrict,
  status public.application_status not null default 'saved',
  applied_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create table public.tailored_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  version int not null default 1,
  cv jsonb not null,                       -- structured tailored CV (see src/lib/ai/schemas.ts)
  cover_letter text,
  change_log text[] not null default '{}', -- what was reworded/reordered and why
  fabrication_warnings text[] not null default '{}',
  approved_at timestamptz,                 -- user must approve before applying
  created_at timestamptz not null default now()
);

-- Every AI action is logged so users can ask "why?" (GDPR / UK DUAA transparency)
create table public.ai_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,                    -- 'parse_cv' | 'score_match' | 'tailor_cv' ...
  model text not null,
  input_ref text,
  output_summary text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger applications_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

-- Create an empty profile when a user signs up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.experiences enable row level security;
alter table public.skills enable row level security;
alter table public.cv_uploads enable row level security;
alter table public.jobs enable row level security;
alter table public.job_matches enable row level security;
alter table public.applications enable row level security;
alter table public.tailored_documents enable row level security;
alter table public.ai_audit_log enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own experiences" on public.experiences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own skills" on public.skills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own uploads" on public.cv_uploads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own matches" on public.job_matches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own applications" on public.applications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own documents" on public.tailored_documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "read own audit log" on public.ai_audit_log
  for select using (auth.uid() = user_id);

create policy "signed-in users read jobs" on public.jobs
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Private storage bucket for uploaded CVs: users only touch '<their id>/...'
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('cvs', 'cvs', false)
  on conflict (id) do nothing;

create policy "own cv files" on storage.objects
  for all to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
