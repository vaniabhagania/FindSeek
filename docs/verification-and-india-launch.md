# FindSeek: India launch, verification rules, Remote Rocketship gaps

**Decided 21 Oct 2026:** FindSeek launches India-only. Germany is dropped for now. Branch `claude/job-portal-cv-app-iihk2t`. Gate and India pipeline in `138210a`; first six audit fixes in `669c59f`; second audit batch in `04bb1dc` (21 Oct); loophole fixes of 28 Oct up to `7cc2760` (611 tests passing). See `loopholes-closed.md` for the list.

## The verification gate (every source, every listing)
A listing reaches a feed only if all six pass; otherwise it is held and the failed checks are stored and shown.
1. **Real hiring source.** The company's own site, an applicant tracking system (Greenhouse, Lever, Workday, Keka, Darwinbox, Naukri, Internshala, etc.), a LinkedIn *job listing*, or a company-domain email. The company's own site is matched on the **registered domain, exactly** (razorpay.com, razorpay.co.in, anything under them), on .com, .in, .co.in, .org, .net, .io, .ai or .tech, or from a short list of big employers whose site isn't their name (tcs.com, techmahindra.com, amazon.jobs and so on). Look-alikes (razorpay-hiring.xyz, razorpay.careers-portal.top, infosys.com.verify-offer.in, razorpay.co) fail. So do free site builders (notion.site, github.io, wixsite.com, vercel.app, Google Sites, Google Forms…), WhatsApp/Telegram, link shorteners, social posts and personal mailboxes. An application email must be the company's own for every recipient. **An opening posted on FindSeek by an employer** counts as the company's own only if the posting account signs in with an email on the company's domain, or is an operator (`OPERATOR_EMAILS`), or its domain is vetted and listed in `TRUSTED_EMPLOYER_DOMAINS`. A free mailbox never counts, whatever company name is typed. The email is used for the check and never stored.
2. **Full description** (80+ words, and not padded). Text that repeats itself (more than 30% of it word-for-word repeated) or uses fewer than 40 different words is held, whatever its length.
3. **Qualifications stated.** Two different kinds of requirement under a "Requirements"-style heading, or three kinds without one. The kinds are education (B.Tech, B.E., MCA, MBA, degree, graduate, diploma…), years of experience, experience in something, and a named skill ("knowledge of", "proficient in", "familiar with"). A lone keyword, or the same one repeated, does not count. The word "be" is not a B.E. degree.
4. **Pay stated.** An amount counts only beside a pay word (salary, CTC, stipend, package, honorarium…) or an LPA / per-month unit, never next to insurance, bonds, fees, deposits, funding, bonuses or other perks, and not in other currencies. Bare numbers count straight after "Salary:" or "Stipend". Normalised to annual INR; foreign currency accepted for global remote.
5. **No scam signals.** The text is cleaned first (letter-spacing, zero-width and look-alike characters). Flags: upfront fees and deposits, charges for an offer letter or interview, WhatsApp/Telegram-only hiring (including handles), big earnings from home, guaranteed job or income, network marketing or pay-to-join, "no interview, direct joining", personal email to apply, in English, Hinglish and Hindi. An ad that says it charges nothing ("no registration fee") is not flagged.
6. **Open to candidates in India.** Roles based in India pass. An ad that names India only to rule it out ("Worldwide (except India)", "unable to hire candidates in India", "not open to candidates in India", "hiring outside India only") fails, unless the same sentence turns it around ("…but candidates in India are welcome"). The word India counts as a yes only when the same sentence talks about hiring or candidates. With no location given, "Join our Pune office" or "based in Hyderabad" counts. Remote roles locked to another country or region fail; worldwide/APAC passes; otherwise unclear (which is held).

## Where the gate is enforced
- In the app: every route that publishes, edits a live opening, or accepts an application runs the gate or checks its result.
- **In the database (migration 0007):** the app is not the only door, because Supabase exposes the tables over a REST API. An employer's own session cannot set a post's status, rewrite a live opening, change its pay, unlink it from its listing, change who owns it or when it was published, or delete anything but a draft. Only the server (service role) can open, edit live content or close. Candidates can read and apply to a post only if its listing in `jobs` is verified and not closed (`post_is_live`); a candidate who already applied can still see it.
- **Migration 0008:** deleting an opening (including by deleting the employer account) closes its public listing.
- 35 checks in `supabase/tests/employer_gate.sql` run as the real roles; `npm run db:test` runs them against a throwaway Postgres.

## Reports from users (migration 0005)
- Each report is weighted by the reporter: account age (0 under a day, 0.5 up to a week, 1 after), a finished profile (+0.5), having applied to something (+0.5), and whether earlier reports were upheld (+0.25 each, up to 2) or dismissed (−0.5 each, up to 4). Capped at 2.
- A listing is pulled automatically only when **at least 3 different people** report the same problem **and their weights add up to 4 or more**. Three brand-new accounts weigh 0; three week-old accounts with nothing else weigh 3; three people with a finished profile weigh 4.5.
- Everything else waits in a review queue at **/ops/reports**, open only to email addresses listed in the `OPERATOR_EMAILS` setting (confirmed sign-in; anyone else gets "not found"). **Confirm** pulls the listing (closes it, for "closed") and credits the reporters; the daily refresh can't bring it back. **Dismiss** restores the listing if reports were the only thing holding it, and lowers the reporters' weight.
- You can only report a listing you can see; reports can't be edited or deleted; 30 reports a day; reporting needs a sign-in but not AI consent. A listing someone brought in themselves is private to them, so reports on it do nothing.
- Tested against a throwaway Postgres 16 database with 30 scenarios: throwaway accounts, forged reports, reports on hidden listings, deleting evidence, calling the review functions as an ordinary user or anonymously, the daily limit, confirm/dismiss, and applying the migration over existing reports.

## Limits and safeguards that protect the server, the AI budget and the people on it
- Pasted job posts and employer descriptions: 20,000 characters. Onboarding text: 3,000. Job titles read for duplicates: 300. Every reader stops at 40,000, whatever the source. Timing tests feed every reader the longest hostile text it will ever see.
- Daily per-user limits on the paid AI actions, counted in the database (`take_ai_quota`, migration 0004): bring a job 10, read onboarding words 5, read a CV 5, find matches 6, tailor a CV 20. Tested with 24 simultaneous requests against a limit of 6: exactly 6 allowed. Change them in `src/lib/limits.ts`.
- The red alert box shows only messages from a fixed list of codes (`src/lib/notices.ts`); nothing from the page link is ever printed.
- Submit buttons lock and show progress while an action runs.
- Every page sends security headers: no framing, no sniffing, strict referrer and permissions, same-origin opener, plus (in production) HSTS and a content policy that allows only this site's own scripts, images and requests and blocks forms posting elsewhere. The policy still permits inline scripts, because Next.js needs them; a stricter nonce policy would make every page dynamic. `X-Powered-By` is removed.
- Redirects after sign-in and saving accept only paths on this site (`/\evil.com` and tab tricks are rejected). The cron secret is compared in constant time. The data export is never cached. Account deletion refuses requests that do not come from this site.
- A deployed site with no database connected sends signed-in paths to sign-in. The list of missing settings is shown to operators, not visitors, in production.

## Sources
- Automatic: Adzuna India, company boards on Greenhouse/Lever (extra boards via `GREENHOUSE_BOARDS` / `LEVER_SITES` env, as `slug:Company`).
- LinkedIn, Instagram, Facebook: **not scraped.** LinkedIn has no public jobs API and bans scraping; Facebook Jobs shut down in Feb 2022; Instagram has no jobs API. Users bring posts in via "Bring a job"; AI-extracted fields not literally in the post are discarded; submissions stay private to the user.
- Each listing says only what was checked: "Seen on the company's job board 3 hours ago" for Greenhouse and Lever, "Seen in job-site listings…" for Adzuna, nothing for pasted posts and employer openings.

## Employer openings
- Edit page (`/admin/posts/<id>/edit`). A draft or closed opening is saved as is; the gate runs at publishing. A **live** opening must still pass all six checks before an edit is saved, and the listing candidates see is updated in the same step. An edit that adds a fee, drops the qualifications or rules out India is refused with the list of what is missing and a hint for each.
- Closing an opening closes its public listing first. Drafts made before migration 0003 have no pay; open them with Edit and add it.

## Remote Rocketship gaps and what FindSeek does instead
| Their weak spot | FindSeek |
|---|---|
| Closed jobs still listed (they admit a lag) | Last-seen tracking, boards closed on disappearance, live re-check before tailoring |
| "Remote" that isn't open to your country; filters not applied to every result | India-eligibility check on every listing; filters applied server-side |
| Opaque "ghost score" estimate | Plain-language ghost signals (age, reposts, talent-pool ads) |
| Duplicates / roles seen elsewhere | Dedupe key (keeps level and team), employer copy preferred, reposts counted |
| Small free sample, coverage hard to judge before paying | Live and held-back counts shown on the jobs page |
| Partner auto-apply: generic CVs, skipped screening questions | No auto-apply; per-job CV from confirmed facts, user approval, monthly cap |

## Audit (21 Oct) and where it stands
Audit doc: https://claude.ai/artifact/D2J5G5hXAbrkHSznN9E5fC. The 58 hand-written tricky listings: **25 right** before any fix, **50** after the first six, **54** after the second batch. The four that were still wrong (filler text with a keyword or two passing the description and qualifications checks, a deal-breaker firing on "There is no service bond", "Backend Engineer - I" and "- II" merging as duplicates) are fixed on 28 Oct, along with the "Checked live" label, employers setting an opening's status through the API, and the other items in `loopholes-closed.md`.

A bug the audit missed, found while building the edit page: after migration 0003 **employers could not create an opening at all** (permission denied on the new pay columns). Migration 0006 fixes it.

Not built: automatic daily matching with an email digest, the interview calendar, merge-not-replace onboarding, "Confirm all" on CV items, fixing a held brought-in job in place, learning from past hiring outcomes.

## To do before launch
- Apply migrations **`0003` to `0008`** in order (all tested on Postgres 16 with Supabase's auth and roles stubbed via `npm run db:test`, **not yet on the live Supabase project**). Existing jobs start as held until the next ingest re-verifies them, and employer openings must be re-published. The app stops AI actions, rather than running without a limit, if 0004 is missing. Without 0007 the publishing gate is enforced only by the app.
- Set `OPERATOR_EMAILS` to the people who will review reports and who may post for any company (without it the review page is off and reports below the automatic threshold just wait).
- Set `TRUSTED_EMPLOYER_DOMAINS` to the domains of employers you have vetted whose site does not match their name (empty is fine to start).
- Set `JOB_COUNTRIES=in` in Vercel, plus the Supabase, Anthropic, `CRON_SECRET`, and optional Adzuna and Resend values; then run `npm run smoke -- https://findseek.vercel.app`.
- Add verified Indian company boards to `GREENHOUSE_BOARDS` / `LEVER_SITES` (check each loads first).
- Run the import once and read the held-back reasons: most Adzuna and Greenhouse listings in India are expected to be held (short excerpts, no pay), so the feed may start thin.
- Pricing is a product decision not made yet; Remote Rocketship's hidden pricing and auto-renewal are a common complaint.
