# FindSeek: live deployment and original-idea test

Tested 22 October 2026 against `https://findseek.vercel.app` (production deployment of commit `04bb1dc`).
Re-runnable checks: `npm test` (419 tests), `npm run smoke -- <url>` (31 live checks).

## 1. Hosting

| Item | Result |
| --- | --- |
| Vercel project | `findseek` (team Vania, Hobby plan), linked to GitHub `vaniabhagania/findseek`, pushes to `claude/job-portal-cv-app-iihk2t` deploy to production |
| Deployed commit | `04bb1dc`, state READY, aliases `findseek.vercel.app`, `findseek-vania15.vercel.app`, branch alias |
| Public access | **Done.** Vercel Authentication was on (`all_except_custom_domains`), so visitors had to sign in to Vercel. It is now off; the site loads for anyone with no login |
| Cron | `vercel.json` schedules `/api/jobs/ingest` daily at 06:17 UTC (11:47 IST). Hobby allows once a day, so this fits |
| Runtime errors | None in the last 30 minutes (Hobby keeps one hour of logs) |
| Functions region | `iad1` (US East). Users are in India, so every signed-in page pays a round trip. Move to `bom1` (Mumbai) and pick a Supabase region near it |
| **Not connected** | **No environment variables are set.** The app shows its "Setup needed" state, sign-in cannot send a link, and no jobs exist yet. See section 4 |

## 2. Live tests on the public site

Run from a browser on the live origin (this build environment cannot reach `vercel.app` from its shell).

| Area | Check | Result |
| --- | --- | --- |
| Headers | CSP with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, no third-party scripts | Pass, on pages, API routes and 404s |
| Headers | HSTS 2 years, `X-Frame-Options: DENY`, `nosniff`, referrer policy, permissions policy, no `X-Powered-By` | Pass |
| Private API | `/api/jobs/ingest` with no secret or a wrong one | 401 both; POST is 405 |
| Private API | `/api/account/export` signed out | 401 |
| Operator page | `/ops/reports` as a stranger | 404, same as a mistyped address |
| Open redirect | `/auth/callback?next=//evil.example.com` and `https://evil…` | Ends on `/login`, never leaves the site |
| Injected text | `/login?error=<img onerror…>` and `?error=Pay ₹2000 to restore` | Neither appears on the page; only fixed messages show. The text exists only inside Next's escaped page data |
| Secrets files | `/.env`, traversal path | 404 |
| Sign-in form | Submit a reserved fake address (`example.invalid`) with Supabase unconnected | Fails gracefully: "The app isn't fully connected yet, so this can't be saved." |
| Phone width (375px) | Landing and sign-in | No sideways scroll, 44px tap targets, labelled field |
| Metadata | `lang=en-IN`, one `h1`, description, favicon, no images without alt | Pass |
| Speed | Server response about 0.5 s, page load about 4 s, 139 KB of JavaScript | Indicative only: the test pane runs hidden, so paint timings were discarded |

Automated gate on the deployed commit: 419 of 419 tests pass (15 files), type check clean, lint clean, production build clean.

### Findings from the live run

1. **Medium. `/ops/reports` was prerendered as a fixed 404 at build time.** With no operator list set, `getOperator()` returned before reading cookies, so Next saved the page as static. It would have corrected itself on the next build after keys were added, but a page that depends on who is signed in should never depend on that. **Fixed in the commit that adds this report:** `getOperator()` now calls `connection()`, and the build shows `/ops/reports` as dynamic.
2. **Low. The "Setup needed" notice is shown to every visitor.** It lists the variable names (not values). Harmless once keys are set; until then it is the first thing the public sees.
3. **Low. No `robots.txt`, sitemap or share-preview (Open Graph) tags.** `/jobs`, `/admin` and `/ops` should be disallowed from search engines; a shared link has no title card.
4. **Low. The sign-in email field is 15px.** iOS Safari zooms the page when a field under 16px gets focus.
5. **Low. No skip-to-content link and no `nav` landmark** on the landing page.
6. **Low. The landing page says "Track every application in one place, with what to prepare for each."** The tracker shows status and applied date only; the single "what to prepare" tip is on each job page.

## 3. Test against the original idea

Source: the FindSeek project description. Status key: **Built**, **Partly**, **Not built**.
Evidence is code and automated tests. Anything that calls the AI or the database could not be exercised live, because no keys are connected yet.

### User side

| # | Original idea | Status | What exists / what is missing |
| --- | --- | --- | --- |
| U1 | AI asks your profession, domain, interests, skills | **Built** (one question, not a dialog) | Onboarding asks "What are you looking for?" in the user's own words; `intake.ts` turns it into stage, roles, cities, pay, notice period, deal-breakers; the user confirms; the CV upload fills skills and experience. It does not ask follow-up questions |
| U2 | Searches relevant openings on job portals, worldwide | **Partly** | Sources: Adzuna, Greenhouse boards, Lever sites, employers posting on FindSeek, and links the user brings in (including LinkedIn listings). Each passes the six-check verification gate. India only, by your decision. No direct reading of LinkedIn, Instagram or Facebook feeds (their terms forbid it); no jobs until Supabase and the Adzuna key are connected |
| U3 | Tailors the CV for each job | **Built** | `tailor-cv.ts`: reorders and rewords only from verified facts, lists missing keywords, writes a change log, blocks invented employers, dates and numbers (`guard.ts`), and the user approves before use. Only 2 unit tests cover the guard; the tailoring call itself has not been run live |
| U4 | Researches how previous candidates were approved or rejected and uses it | **Not built** | The prompt carries general hiring conventions (ATS keywords, one page for freshers, no photo or date of birth). Nothing about real past outcomes is collected or used |
| U5 | Posts the application | **Partly, by design** | Employer openings on FindSeek: the user submits in-app after approving the CV, and can withdraw. External jobs: opens the application page and the user marks it applied. FindSeek does not submit on third-party portals |
| U6 | Connected to your calendar for interviews and other activities | **Not built** | The tracker has an "Interview" column and the dashboard counts interviews. There is no interview date, reminder, calendar link or `.ics` export anywhere |
| U7 | Time to prepare for interviews instead of searching | **Partly** | Matching and per-job CVs remove the search work. Prep help is one "what to prepare" tip per job page |

### Admin side

| # | Original idea | Status | What exists / what is missing |
| --- | --- | --- | --- |
| A1 | Find candidates who applied to your job description | **Built** | Employers create openings (publishing runs the same verification gate), candidates apply, and the list is ordered by score |
| A2 | Upload criteria, questions, requirements, restrictions, keywords for AI to filter | **Partly** | Criteria are typed in as hard requirement, must-have or nice-to-have; free text covers keywords and restrictions. Criteria about age, gender, religion, family and similar are blocked. Missing: uploading a criteria document, questions put to candidates, a separate keyword list |
| A3 | Schedule interviews accordingly | **Not built** | Applications move submitted, screened, selected or not selected. No scheduling, slots or invites |
| A4 | AI brief on how and why a candidate was selected | **Built** | Score, recommendation, evidence per criterion and a plain summary for each applicant; a person records the decision |
| A5 | Email selected and non-selected candidates appropriately | **Built, with a human step** | Outcome drafts for each case, editable, sent through Resend (needs `RESEND_API_KEY` and a verified `EMAIL_FROM`). The recruiter confirms every send; nothing goes automatically |

Both faces exist: seeker pages (`/dashboard`, `/jobs`, `/tracker`, `/profile`) and employer pages (`/admin`), plus an operator review page (`/ops/reports`).

**Score: 5 built, 4 partly, 3 not built** out of 12 requirements. The three not built are the calendar (U6), interview scheduling (A3) and learning from past outcomes (U4).

## 4. Needed before the public site works

Set in Vercel (Project, Settings, Environment Variables), then redeploy:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `CRON_SECRET` (any long random string; Vercel sends it to the cron automatically)
- `JOB_COUNTRIES=in`, `OPERATOR_EMAILS` (your confirmed email), optional `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`, `GREENHOUSE_BOARDS`, `LEVER_SITES`, `RESEND_API_KEY`, `EMAIL_FROM`

In Supabase: apply migrations `0003` to `0006` (they are not on any live database yet), and set Authentication, URL configuration, Site URL and redirect URL to `https://findseek.vercel.app` or the sign-in links will not land.

After that, run `npm run smoke -- https://findseek.vercel.app` again. The private-page checks switch from "setup notice" to "sent to sign-in".

## 4. Update, 28 October 2026: loopholes closed

Fixed on the branch after the run above (597 unit tests, 35 database checks, lint, types and build clean).

| Finding | Status |
| --- | --- |
| Section 2 finding 2: setup notice shown to every visitor | Fixed. In production it appears only in the operator area |
| Finding 3: no `robots.txt` or share tags | Fixed. `robots.txt` keeps crawlers out of the app (the operator area is not listed, it is `noindex`); share tags added |
| Finding 4: 15px sign-in field | Fixed. Text inputs are 16px |
| Finding 5: no skip link | Fixed. Skip-to-content link and a `main` target on every layout (the main navigation already had a landmark) |
| Finding 6: tracker copy | Fixed. The landing page now says what the tracker and job page do |
| Next.js and zod advisories | Fixed. Next 16.4.3, zod 4.6.7, vite patched; `npm audit` reports 0 |
| Employers could set a post's status through the API | Fixed in migration 0007 and tested against real database roles |
| A pulled or held listing still took applications | Fixed in the app and in the database |
| An employer could post as any company by typing its name | Fixed. Needs an email on the company's domain, or an operator, or a listed domain |
| Filler text passed the description and qualifications checks | Fixed. Repeated or padded text is held; a heading plus one keyword is not enough |
| A deal-breaker fired on a denial ("there is no service bond") | Fixed |
| "Engineer II" and "Engineer III" merged as duplicates | Fixed |
| "Checked live" shown for listings nobody re-checks | Fixed. Each source says only what was checked |
| Deleting an employer account left its listings live | Fixed in migration 0008 |
| Account deletion could be requested from another site | Fixed. The route refuses cross-site requests |

Still open: the live Supabase project has none of migrations 0003 to 0008 applied and Vercel has no
environment variables, so none of the database changes have run against the real project. The interview
calendar, the daily email digest and learning from past hiring outcomes are not built.
