-- The six-check publishing gate could be bypassed through the database API.
--
-- Until now the gate ran only inside the app's Server Actions. Migration 0002 also let an employer's
-- signed-in session write `job_posts.status` (and the text of a live opening) directly, so anyone who
-- called the REST API instead of the app could:
--   1. set their own draft to 'open' without any check;
--   2. rewrite a verified, live opening to say "pay a registration fee" without any check;
--   3. delete a live opening that candidates had already applied to.
-- Separately, the candidate-side rules looked only at `job_posts.status`. When an operator pulled a
-- listing for a confirmed report (migration 0005 sets jobs.closed_at / holds it), the opening still
-- said 'open', so candidates could still submit applications and still saw it.
--
-- After this migration:
--   * Status, the link to the verified listing and the publish time change only on the server
--     (service role): publishing, closing and re-checking all go through the app, which runs the gate.
--   * A live opening's text and pay cannot be edited with a user session; the edit page runs the gate
--     and writes with the server key. Drafts and closed openings stay freely editable.
--   * Only a draft can be deleted with a user session.
--   * A candidate can see, and apply to, an opening only while its verified listing is live.

-- ---------------------------------------------------------------------------
-- Status is the server's to set
-- ---------------------------------------------------------------------------
revoke update (status) on public.job_posts from authenticated;

-- Defence in depth: a later migration that re-grants a column must not quietly re-open the hole.
create or replace function public.job_posts_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Only requests made with a person's own session are limited. The server (service role), the table
  -- owner and referential actions (a deleted listing unlinking its post) are not.
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'only a draft opening can be deleted; close a live one instead' using errcode = '42501';
    end if;
    return old;
  end if;

  if new.status is distinct from old.status
     or new.job_id is distinct from old.job_id
     or new.published_at is distinct from old.published_at
     or new.employer_id is distinct from old.employer_id then
    raise exception 'an opening''s status, link and publish time are set by the server when it is published or closed'
      using errcode = '42501';
  end if;

  if old.status = 'open' and (
       new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.location is distinct from old.location
       or new.country_code is distinct from old.country_code
       or new.remote is distinct from old.remote
       or new.pay_min_inr is distinct from old.pay_min_inr
       or new.pay_max_inr is distinct from old.pay_max_inr
       or new.pay_period is distinct from old.pay_period
     ) then
    raise exception 'a live opening is edited from its edit page, so that every check runs again' using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists job_posts_guard_update on public.job_posts;
create trigger job_posts_guard_update before update on public.job_posts
  for each row execute function public.job_posts_guard();
drop trigger if exists job_posts_guard_delete on public.job_posts;
create trigger job_posts_guard_delete before delete on public.job_posts
  for each row execute function public.job_posts_guard();

revoke all on function public.job_posts_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Candidates see and apply to openings whose verified listing is live
-- ---------------------------------------------------------------------------
-- "Live" = the post is open and the listing it published is still verified and not closed. Security
-- definer so the answer does not depend on which listings the asking user may read.
create or replace function public.post_is_live(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.job_posts p
    join public.jobs j on j.id = p.job_id
    where p.id = pid
      and p.status = 'open'
      and j.verification_status = 'verified'
      and j.closed_at is null
  );
$$;
revoke all on function public.post_is_live(uuid) from public, anon;
grant execute on function public.post_is_live(uuid) to authenticated, service_role;

-- (The old policy also said `pa.job_post_id = id` inside its subquery, where the bare `id` meant the
-- application's own id, so "posts you applied to" never matched and applicants lost sight of a post
-- the moment it closed. It is qualified here.)
drop policy "candidates read open posts" on public.job_posts;
create policy "candidates read live posts" on public.job_posts
  for select to authenticated using (
    public.post_is_live(id)
    or exists (select 1 from public.post_applications pa where pa.job_post_id = job_posts.id and pa.user_id = auth.uid())
  );

drop policy "candidate submits own application" on public.post_applications;
create policy "candidate submits own application" on public.post_applications
  for insert with check (
    user_id = auth.uid()
    and status = 'submitted'
    and public.post_is_live(job_post_id)
  );
