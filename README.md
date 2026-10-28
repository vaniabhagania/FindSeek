# FindSeek

Verified jobs and internships across India, matched to the person, with a CV tailored to each one. Two
sides: job seekers (`/dashboard`, `/jobs`, `/tracker`, `/profile`) and employers (`/admin`), plus a review
queue for operators (`/ops/reports`). Built with Next.js 16 (App Router), Supabase and the Anthropic API.

> This is not the Next.js you may know. Read `AGENTS.md` and the guides in `node_modules/next/dist/docs/`
> before changing framework-level code.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in the values; every one is explained in the file
npm run dev
```

Without keys the app still starts and shows what is missing. In production that list is shown only in the
operator area.

## The checks before you push

```bash
npm run lint
npm run typecheck
npm test            # unit tests, including timing guards against hostile text
npm run build
PGADMIN_URL=postgres://postgres@127.0.0.1:5432/postgres npm run db:test
```

`db:test` needs `psql` and a Postgres 15+ server you may create databases on. It applies every migration
to a throwaway database with Supabase's `auth` and `storage` schemas and roles stubbed
(`supabase/tests/stub-supabase.sql`), then runs `supabase/tests/*_*.sql` as the real roles a request would
use. `npm run smoke -- https://your-site` runs live checks against a deployment.

## Database

Apply the files in `supabase/migrations/` in order (`0001` to `0008`) in the Supabase SQL editor or with
the Supabase CLI. What the later ones do:

| File | Purpose |
| --- | --- |
| `0003` | Verification gate columns, user reports, India fields |
| `0004` | Per-user daily limits on the paid AI actions (`take_ai_quota`) |
| `0005` | Weighted reports, the operator review queue |
| `0006` | Employers can create openings with pay |
| `0007` | The publishing gate is enforced in the database: an employer cannot open, edit or delete a live opening, or make one visible, except through the server; candidates only see and apply to openings whose verified listing is open |
| `0008` | A listing closes when its opening (or the employer account behind it) is deleted |

## How a listing is verified

Every listing, from every source, passes six checks or is held back with the reason stored: a real hiring
source, a full description, qualifications, stated pay, no scam signals, open to candidates in India. The
code is in `src/lib/jobs/verify.ts` and `src/lib/india/`. An employer's opening counts as the company's own
only when the account signs in with an email on the company's own domain; see `TRUSTED_EMPLOYER_DOMAINS`
and `OPERATOR_EMAILS` in `.env.example`.

## Deploy

Deployed on Vercel from the `claude/job-portal-cv-app-iihk2t` branch. `vercel.json` runs the daily import
(`/api/jobs/ingest`, protected by `CRON_SECRET`). Set the environment variables from `.env.example` in the
Vercel project, apply the migrations, then run the smoke script.
