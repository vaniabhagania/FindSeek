-- Employers could not save an opening's pay.
--
-- Migration 0002 limited what employers may write on job_posts to a list of columns. Migration 0003
-- then added the pay columns the app now requires on every opening, but never added them to that
-- list, so "New opening" failed with "permission denied for table job_posts" and a draft could never
-- gain pay. Grants on columns added later are not automatic, so they are given here.

grant insert (pay_min_inr, pay_max_inr, pay_period) on public.job_posts to authenticated;
grant update (pay_min_inr, pay_max_inr, pay_period) on public.job_posts to authenticated;
