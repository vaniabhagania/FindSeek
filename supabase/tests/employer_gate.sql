-- Employer openings: the verification gate cannot be bypassed through the database API.
--
-- Run by scripts/db-test.sh against a throwaway Postgres with migrations applied. Every check runs
-- as the real role a request would use (authenticated employer, authenticated candidate, service
-- role) and compares the resulting row state, because Row Level Security hides rows silently
-- instead of raising an error.

create schema tt;
create table tt.results (n serial, label text, ok boolean);

-- Runs one statement as `r` with `uid` as the signed-in user. Returns 'ok' or the error message.
create function tt.run_as(uid uuid, r text, q text) returns text language plpgsql as $$
declare msg text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  execute format('set local role %I', r);
  begin
    execute q;
  exception when others then
    msg := sqlerrm;
  end;
  reset role;
  return coalesce(msg, 'ok');
end $$;

create function tt.count_as(uid uuid, r text, q text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  execute format('set local role %I', r);
  execute 'select count(*) from (' || q || ') s' into n;
  reset role;
  return n;
end $$;

create function tt.check(label text, cond boolean) returns void language sql as
$$ insert into tt.results (label, ok) values (label, coalesce(cond, false)) $$;

\o /dev/null
\set emp   '00000000-0000-0000-0000-0000000000e1'
\set cand1 '00000000-0000-0000-0000-0000000000c1'
\set cand2 '00000000-0000-0000-0000-0000000000c2'
\set emp2  '00000000-0000-0000-0000-0000000000e2'
\set org   '00000000-0000-0000-0000-00000000000a'
\set p2    '00000000-0000-0000-0000-0000000000b2'
\set p3    '00000000-0000-0000-0000-0000000000b3'
\set j2    '00000000-0000-0000-0000-0000000000d2'

insert into auth.users (id, email) values
  (:'emp', 'emp@example.test'), (:'emp2', 'emp2@example.test'),
  (:'cand1', 'c1@example.test'), (:'cand2', 'c2@example.test');
insert into public.employers (id, name, created_by) values (:'org', 'Acme', :'emp');
insert into public.employer_members (employer_id, user_id, role) values (:'org', :'emp', 'owner');

-- 1. An employer may draft an opening, but cannot open it by writing the status themselves.
select tt.check('employer can insert a draft',
  tt.run_as(:'emp', 'authenticated', format($q$
    insert into public.job_posts (employer_id, title, description, location, country_code, remote, pay_min_inr, pay_max_inr, pay_period)
    values (%L, 'Scam role', 'Pay a refundable deposit first. This description is long enough to pass the check.', 'Pune', 'in', false, 300000, 400000, 'year')
  $q$, :'org')) = 'ok');
select id as p1 from public.job_posts where title = 'Scam role' \gset
select tt.check('employer cannot insert an opening that is already open',
  tt.run_as(:'emp', 'authenticated', format($q$
    insert into public.job_posts (employer_id, title, description, status)
    values (%L, 'Sneaky', 'Inserted already open. This description is long enough to pass the check.', 'open')
  $q$, :'org')) <> 'ok');
select tt.run_as(:'emp', 'authenticated', format($q$update public.job_posts set status = 'open' where id = %L$q$, :'p1'));
select tt.check('employer cannot set status to open directly',
  (select status from public.job_posts where id = :'p1') = 'draft');
select tt.run_as(:'emp', 'authenticated', format($q$update public.job_posts set title = 'Edited draft' where id = %L$q$, :'p1'));
select tt.check('employer can still edit a draft', (select title from public.job_posts where id = :'p1') = 'Edited draft');

-- 2. A live opening: published by the server (verified listing in public.jobs, post open and linked).
insert into public.jobs (id, source, external_id, company, title, description, apply_url, verification_status, verified_at)
values (:'j2', 'manual', :'p2', 'Acme', 'Backend Engineer', 'A real verified description.', '/jobs/' || :'j2', 'verified', now());
insert into public.job_posts (id, employer_id, job_id, title, description, status, published_at, pay_min_inr, pay_max_inr)
values (:'p2', :'org', :'j2', 'Backend Engineer', 'The original verified description of this opening, long enough.', 'open', now(), 800000, 1200000);

select tt.run_as(:'emp', 'authenticated', format($q$update public.job_posts set description = 'Now asks for a fee. Pay a registration fee to apply. Long enough text here.' where id = %L$q$, :'p2'));
select tt.check('employer cannot rewrite a live opening around the gate',
  (select description from public.job_posts where id = :'p2') like 'The original verified%');
select tt.run_as(:'emp', 'authenticated', format($q$update public.job_posts set pay_max_inr = 99999999 where id = %L$q$, :'p2'));
select tt.check('employer cannot change a live opening''s pay around the gate',
  (select pay_max_inr from public.job_posts where id = :'p2') = 1200000);
select tt.run_as(:'emp', 'authenticated', format($q$update public.job_posts set status = 'closed' where id = %L$q$, :'p2'));
select tt.check('status changes are server-only (even closing)', (select status from public.job_posts where id = :'p2') = 'open');
select tt.run_as(:'emp', 'authenticated', format($q$update public.job_posts set job_id = null where id = %L$q$, :'p2'));
select tt.check('employer cannot unlink a live opening from its verified listing',
  (select job_id from public.job_posts where id = :'p2') = :'j2');
select tt.run_as(:'emp', 'authenticated', format($q$update public.job_posts set published_at = now() - interval '5 years' where id = %L$q$, :'p2'));
select tt.check('employer cannot rewrite the publish time', (select published_at from public.job_posts where id = :'p2') > now() - interval '1 day');

-- The server (service role) can still do all of it.
select tt.run_as(null, 'service_role', format($q$update public.job_posts set description = 'Server edit after passing the gate again. Long enough text here.' where id = %L$q$, :'p2'));
select tt.check('service role can edit a live opening', (select description from public.job_posts where id = :'p2') like 'Server edit%');
select tt.run_as(null, 'service_role', format($q$update public.job_posts set status = 'closed' where id = %L$q$, :'p2'));
select tt.check('service role can close', (select status from public.job_posts where id = :'p2') = 'closed');
select tt.run_as(null, 'service_role', format($q$update public.job_posts set status = 'open' where id = %L$q$, :'p2'));
select tt.check('service role can reopen', (select status from public.job_posts where id = :'p2') = 'open');

-- Deleting: only a draft can be removed with a user session.
select tt.run_as(:'emp', 'authenticated', format($q$delete from public.job_posts where id = %L$q$, :'p2'));
select tt.check('employer cannot delete a live opening', exists (select 1 from public.job_posts where id = :'p2'));
insert into public.job_posts (id, employer_id, title, description)
values ('00000000-0000-0000-0000-0000000000b4', :'org', 'Throwaway draft', 'A draft the employer decides to delete again, long enough text.');
select tt.run_as(:'emp', 'authenticated', $q$delete from public.job_posts where id = '00000000-0000-0000-0000-0000000000b4'$q$);
select tt.check('employer can delete a draft', not exists (select 1 from public.job_posts where id = '00000000-0000-0000-0000-0000000000b4'));

-- Another employer's member cannot touch it at all.
select tt.run_as(:'emp2', 'authenticated', format($q$update public.job_posts set title = 'Hijacked' where id = %L$q$, :'p2'));
select tt.check('a stranger cannot edit it', (select title from public.job_posts where id = :'p2') = 'Backend Engineer');

-- 3. What candidates can see and apply to follows the verified listing, not just the post's own flag.
select tt.check('candidate sees a live opening', tt.count_as(:'cand1', 'authenticated', format('select 1 from public.job_posts where id = %L', :'p2')) = 1);
select tt.check('candidate does not see a draft', tt.count_as(:'cand1', 'authenticated', format('select 1 from public.job_posts where id = %L', :'p1')) = 0);

insert into public.job_posts (id, employer_id, title, description, status, published_at)
values (:'p3', :'org', 'Open but unlinked', 'Marked open with no verified listing behind it, long enough text.', 'open', now());
select tt.check('candidate does not see an open post with no verified listing',
  tt.count_as(:'cand1', 'authenticated', format('select 1 from public.job_posts where id = %L', :'p3')) = 0);

-- Clears any earlier application by this candidate first, so each check stands alone.
create function tt.apply(uid uuid, pid uuid) returns text language plpgsql as $$
begin
  delete from public.post_applications where user_id = uid and job_post_id = pid;
  return tt.run_as(uid, 'authenticated', format($q$
    insert into public.post_applications (job_post_id, user_id, candidate_name, snapshot, consent_shared_at, consent_ai_screening_at)
    values (%L, %L, 'Candidate', '{}'::jsonb, now(), now())
  $q$, pid, uid));
end $$;

select tt.check('candidate can apply to a live opening', tt.apply(:'cand1', :'p2') = 'ok');
select tt.check('candidate cannot apply to a draft', tt.apply(:'cand2', :'p1') <> 'ok');
select tt.check('candidate cannot apply to an open post with no verified listing', tt.apply(:'cand2', :'p3') <> 'ok');

-- An operator pulls the listing (closed): the post still says open, but applications must stop.
update public.jobs set closed_at = now() where id = :'j2';
select tt.check('no new applications once the listing is pulled (closed)', tt.apply(:'cand2', :'p2') <> 'ok');
select tt.check('a pulled listing is hidden from candidates who have not applied',
  tt.count_as(:'cand2', 'authenticated', format('select 1 from public.job_posts where id = %L', :'p2')) = 0);
select tt.check('a candidate who already applied can still see it',
  tt.count_as(:'cand1', 'authenticated', format('select 1 from public.job_posts where id = %L', :'p2')) = 1);

-- ...or holds it back (reports, a failed re-check).
update public.jobs set closed_at = null, verification_status = 'held' where id = :'j2';
select tt.check('no new applications while the listing is held', tt.apply(:'cand2', :'p2') <> 'ok');

-- Restored: applications work again.
update public.jobs set verification_status = 'verified' where id = :'j2';
select tt.check('applications resume once the listing is verified again', tt.apply(:'cand2', :'p2') = 'ok');

\o
\echo
\echo 'employer_gate results'
select format('%s  %s', case when ok then 'PASS' else 'FAIL' end, label) as result from tt.results order by n;
do $$
declare bad int;
begin
  select count(*) into bad from tt.results where not ok;
  if bad > 0 then raise exception '% employer-gate check(s) failed', bad; end if;
end $$;
