import Link from "next/link";
import { dismissMatch, findMatches } from "@/app/actions/jobs";
import { AdzunaAttribution } from "@/components/adzuna-attribution";
import { Plus, Shield } from "@/components/icons";
import { JobRow, type RowJob } from "@/components/job-row";
import { Notice } from "@/components/notice";
import { preferencesOf } from "@/lib/data/profile";
import { INDIAN_CITIES } from "@/lib/india/location";
import { JOB_FEED_COLUMNS } from "@/lib/jobs/feed";
import { fitChecks, fitSummary, type FitJob } from "@/lib/jobs/fit";
import { feedCoverage } from "@/lib/jobs/coverage";
import { getUser } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

type FeedJob = RowJob & FitJob & {
  source: string;
  country_code: string | null;
  scam_flags: string[];
  closed_at: string | null;
  verification_status: string;
};

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const sp = await searchParams;
  const view = one(sp.view) === "all" ? "all" : "matches";
  const city = one(sp.city);
  const mode = one(sp.mode);
  const type = one(sp.type);
  const showAll = one(sp.rules) === "off";

  const { supabase, user } = await getUser();
  if (!supabase || !user) return <p className="muted">Connect Supabase to use FindSeek.</p>;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const prefs = preferencesOf(profile);
  const minScore = profile?.min_match_score ?? 60;

  // Coverage up front, before anyone commits time: how much is live, and how much we turned away.
  const coverage = await feedCoverage();

  const matchFilter = (j: FeedJob) =>
    (!city || (j.cities ?? []).includes(city) || (city === "Remote" && j.work_mode === "remote")) &&
    (!mode || j.work_mode === mode) &&
    (!type || j.job_type === type);

  let rows: { job: FeedJob; score?: number; summary?: string | null; matchId?: string }[] = [];
  let hiddenByRules = 0;

  if (view === "matches") {
    const { data: matches } = await supabase
      .from("job_matches")
      .select(`id, score, summary, jobs(${JOB_FEED_COLUMNS})`)
      .eq("user_id", user.id)
      .eq("dismissed", false)
      .gte("score", minScore)
      .order("score", { ascending: false })
      .limit(80);
    rows = (matches ?? [])
      .map((m) => ({ job: (Array.isArray(m.jobs) ? m.jobs[0] : m.jobs) as unknown as FeedJob, score: m.score, summary: m.summary, matchId: m.id }))
      .filter((r) => r.job && !r.job.closed_at && r.job.verification_status === "verified" && matchFilter(r.job));
  } else {
    let q = supabase.from("jobs").select(JOB_FEED_COLUMNS).eq("verification_status", "verified").is("closed_at", null);
    if (city && city !== "Remote") q = q.contains("cities", [city]);
    if (city === "Remote" || mode) q = q.eq("work_mode", city === "Remote" ? "remote" : mode);
    if (type) q = q.eq("job_type", type);
    const { data: jobs } = await q.order("posted_at", { ascending: false }).limit(60);
    rows = ((jobs ?? []) as unknown as FeedJob[]).map((job) => ({ job }));
  }

  const withChecks = rows.map((r) => ({ ...r, checks: fitChecks(r.job, prefs) }));
  const visible = showAll ? withChecks : withChecks.filter((r) => fitSummary(r.checks).blockers === 0);
  hiddenByRules = withChecks.length - visible.length;

  const cityOptions = [...new Set([...prefs.preferred_cities, ...Object.keys(INDIAN_CITIES)])];
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ ...(view === "all" ? { view } : {}), ...(city ? { city } : {}), ...(mode ? { mode } : {}), ...(type ? { type } : {}), ...(showAll ? { rules: "off" } : {}), ...over });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `/jobs?${s}` : "/jobs";
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Jobs</h1>
          {coverage && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
              <Shield className="text-good" />
              <span><span className="figure font-semibold text-ink">{coverage.live.toLocaleString("en-IN")}</span> verified openings live in India.</span>
              <span><span className="figure font-semibold text-ink">{coverage.heldThisWeek.toLocaleString("en-IN")}</span> held back this week for missing pay, qualifications or a real hiring source.</span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/jobs/add" className="btn-ghost"><Plus /> Bring a job</Link>
          <form action={findMatches}><SubmitButton working="Scoring new jobs…">Find new matches</SubmitButton></form>
        </div>
      </header>

      <Notice error={sp.error} />
      {sp.scored && (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          Scored {one(sp.scored)} new job{one(sp.scored) === "1" ? "" : "s"} against your profile
          {sp.failed ? `; ${one(sp.failed)} couldn't be scored and will be tried again next time` : ""}.
        </p>
      )}

      <div className="panel">
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 pt-2" role="tablist" aria-label="Which jobs">
          {[
            { key: "matches", label: "Matched for you", href: qs({ view: "" }) },
            { key: "all", label: "All verified", href: qs({ view: "all" }) },
          ].map((t) => (
            <Link
              key={t.key}
              href={t.href}
              role="tab"
              aria-selected={view === t.key}
              className="-mb-px border-b-2 border-transparent px-3 pb-2.5 pt-1.5 text-[15px] text-muted aria-selected:border-accent aria-selected:text-ink"
            >
              {t.label}
            </Link>
          ))}
        </div>

        <form method="get" className="flex flex-wrap items-center gap-2 border-b border-line bg-raised px-4 py-3 sm:px-6">
          {view === "all" && <input type="hidden" name="view" value="all" />}
          <select name="city" defaultValue={city} className="input h-9 w-auto py-0 text-sm" aria-label="City">
            <option value="">Any city</option>
            <option value="Remote">Remote</option>
            {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select name="mode" defaultValue={mode} className="input h-9 w-auto py-0 text-sm" aria-label="Work mode">
            <option value="">Any work mode</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
          <select name="type" defaultValue={type} className="input h-9 w-auto py-0 text-sm" aria-label="Job type">
            <option value="">Jobs and internships</option>
            <option value="full_time">Full-time</option>
            <option value="internship">Internships</option>
            <option value="part_time">Part-time</option>
            <option value="contract">Contract</option>
          </select>
          <label className="chip h-9">
            <input type="checkbox" name="rules" value="off" defaultChecked={showAll} />
            Include jobs that break my rules
          </label>
          <button className="btn-ghost h-9">Apply</button>
        </form>

        {visible.length === 0 ? (
          <EmptyState view={view} hidden={hiddenByRules} filtered={Boolean(city || mode || type)} rulesHref={qs({ rules: "off" })} />
        ) : (
          <div className="divide-y divide-line">
            {visible.map(({ job, checks, score, summary, matchId }) => (
              <JobRow key={job.id} job={job} checks={checks} score={score} summary={summary}>
                <Link href={`/jobs/${job.id}`} className="btn">Tailor my CV</Link>
                {matchId && (
                  <form action={dismissMatch.bind(null, matchId)}><button className="btn-quiet">Not for me</button></form>
                )}
                {job.source === "adzuna" && <span className="ml-auto"><AdzunaAttribution countryCode={job.country_code} /></span>}
              </JobRow>
            ))}
          </div>
        )}
        {hiddenByRules > 0 && visible.length > 0 && (
          <p className="border-t border-line px-6 py-3 text-sm text-muted">
            {hiddenByRules} more {hiddenByRules === 1 ? "job breaks" : "jobs break"} one of your rules (city, pay, notice period, job type or deal-breakers).{" "}
            <Link href={qs({ rules: "off" })} className="text-accent underline-offset-2 hover:underline">Show them</Link>
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyState({ view, hidden, filtered, rulesHref }: { view: string; hidden: number; filtered: boolean; rulesHref: string }) {
  return (
    <div className="px-6 py-12 text-center">
      {hidden > 0 ? (
        <>
          <p className="text-[15px]">Every job here breaks one of your rules.</p>
          <p className="mt-1 muted">Loosen a rule on your profile, or <Link href={rulesHref} className="text-accent hover:underline">see them anyway</Link>.</p>
        </>
      ) : view === "matches" ? (
        <>
          <p className="text-[15px]">No matches yet.</p>
          <p className="mt-1 muted">Confirm your experience on your profile, then choose Find new matches. Only verified, open jobs are scored.</p>
        </>
      ) : (
        <>
          <p className="text-[15px]">{filtered ? "No verified openings match these filters right now." : "No verified openings yet."}</p>
          <p className="mt-1 muted">New listings are checked every morning. You can also bring a job you found elsewhere.</p>
        </>
      )}
    </div>
  );
}
