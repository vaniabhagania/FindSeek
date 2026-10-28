-- FindSeek: an opening that is deleted takes its public listing down with it.
--
-- Publishing mirrors an opening into public.jobs (source 'manual') so candidates can see it. That row
-- is linked back with `on delete set null`, so when the opening disappears (an employer account is
-- deleted and the delete cascades to its openings) the listing used to stay verified and open, with
-- nobody left behind it. Candidates kept finding a vacancy that no one was running.

create or replace function public.job_posts_close_listing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.jobs
     set closed_at = coalesce(closed_at, now())
   where source = 'manual'
     and (id = old.job_id or external_id = old.id::text);
  return old;
end $$;

revoke all on function public.job_posts_close_listing() from public, anon, authenticated;

drop trigger if exists job_posts_close_listing on public.job_posts;
create trigger job_posts_close_listing after delete on public.job_posts
  for each row execute function public.job_posts_close_listing();

-- Listings already left behind by an earlier deletion.
update public.jobs j
   set closed_at = now()
 where j.source = 'manual'
   and j.closed_at is null
   and not exists (
     select 1 from public.job_posts p where p.job_id = j.id or p.id::text = j.external_id
   );
