# FindSeek: loopholes closed (28 Oct 2026)

Branch `claude/job-portal-cv-app-iihk2t`, last commit `7cc2760`. Deployed to production on Vercel: the deployment of `7cc2760` is READY and aliased to `findseek.vercel.app`.

This supersedes the open items in `build-status.md` (Next.js and zod upgrade) and in `launch-test-report.md` section 2 (findings 2 to 6), and the "Still open" list in `verification-and-india-launch.md`.

Checks run before pushing: lint clean, type check clean, **611 unit tests** (25 files), production build clean, **35 database checks** against a throwaway Postgres 16 (`npm run db:test`), `npm audit` **0 vulnerabilities**, and the 31 live smoke checks pass against a local production build.

## Security

| Loophole | Fix |
| --- | --- |
| Next.js 16.3.8 (critical advisories) and zod 4.6.5 (high) | Next 16.4.3, zod 4.6.7, vite patched. `npm audit` reports 0 |
| An employer could call the database API directly and set a post's `status` to open, rewrite a live opening, change its pay, unlink it from its verified listing, or delete a live post, skipping the six checks | **Migration 0007.** Column grants removed, a trigger blocks those changes for ordinary sessions, and only the server (service role) can open, edit live content or close. Tested as the real roles: before the fix 11 of the checks failed |
| Candidates could see and apply to an opening whose listing had been pulled or held | Candidates only see and apply to a post whose verified listing is open (`post_is_live`), in the database and in the app. A candidate who already applied can still see it |
| `closePost` closed the post but left the public listing live | Closes the listing first, through the server |
| Anyone could post as any company by typing its name | An opening counts as the company's own only when the account signs in with an email on the company's domain, or is an operator, or the domain is listed in `TRUSTED_EMPLOYER_DOMAINS`. The email is never stored |
| Deleting an employer account left its listings live, with no one behind them | **Migration 0008** closes the listing when its opening is deleted, and closes ones already orphaned |
| Account deletion could be requested by a form on another site | The route refuses requests that are not from our own site (`Sec-Fetch-Site` / `Origin`); the typed `DELETE` confirmation still applies |
| With no Supabase keys the deployed site opened every signed-in screen to anyone | In production those paths send visitors to sign-in until the database is connected |

## Verification gate

| Loophole | Fix |
| --- | --- |
| Filler text passed the description check by repeating a sentence past 80 words, or the qualifications check with a heading and one keyword | Text that repeats itself or uses fewer than 40 different words is held. Qualifications need two different kinds of requirement under a heading (education, years, experience in something, a named skill), three without one |
| The word "be" counted as a B.E. degree | Only `B.E.` or capitals next to other degrees count |
| A deal-breaker fired on a denial ("There is no service bond", "we will not ask you to sign a bond") | Denials in the same clause, the nearest six words, or just after the mention are skipped; any real mention still counts |
| "Backend Engineer - I", "- II" and different teams merged as duplicates | The duplicate key keeps seniority level and team; the same vacancy on two sites still collapses. Long junk titles are capped so they cannot make it slow |
| "Checked live" shown for pasted posts and employer openings that nobody re-checks | Company-board listings say "Seen on the company's job board 3 hours ago", job-site listings "Seen in job-site listings…", pasted and employer posts make no claim. The landing page's sample no longer implies a live check |

## Public site

`robots.txt` keeps crawlers out of the app (the operator area is not listed, because it answers "not found" to strangers; it is `noindex` instead). Signed-in pages and sign-in are `noindex`. Share-card tags added. Skip-to-content link on every layout. Text inputs are 16px so iPhones do not zoom. The "Setup needed" list of variable names is shown to operators, not to visitors in production. The landing page's tracker line now says what the tracker does.

## Tests added

Gate and parsing: duplicate keys (28), deal-breakers (39), filler text and qualifications (about 30), freshness wording, employer trust, opening acceptance, and timing guards that feed every reader the longest hostile text (a quadratic pattern on unclosed brackets was found this way and fixed). Server actions: close, publish and edit behaviour per client (user session vs server). Routes: cross-site account deletion. Proxy: signed-in areas with no database. SQL: `supabase/tests/employer_gate.sql`, 35 checks as real roles.

## Still open

- **The live Supabase project has none of migrations 0003 to 0008 applied, and Vercel has no environment variables.** Every database change above is verified on a local Postgres 16 with Supabase's roles stubbed, not on the real project. Apply `0003` to `0008` in order, set the variables, then run `npm run smoke -- https://findseek.vercel.app`.
- With no keys, nobody can reach the operator area to see what is missing; the list is in `.env.example` and the README.
- `TRUSTED_EMPLOYER_DOMAINS` and `OPERATOR_EMAILS` need real values before employers can publish.
- Functions still run in `iad1`; move to `bom1` (Mumbai).
- Not built: interview calendar and scheduling, the daily matching email digest, learning from past hiring outcomes, DigiLocker / NAD import, consent-version records and a DPDP grievance flow, tests for intake and profile actions, a live CV-tailoring run.
- Low: the git remote still points at the old repository URL (`vaniabhagania/findseek`); GitHub redirects to `FindSeek`, and pushes work.
