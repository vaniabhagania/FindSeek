import Link from "next/link";
import { dismissMatch, findMatches } from "@/app/actions/jobs";
import { AdzunaAttribution } from "@/components/adzuna-attribution";
import { Notice } from "@/components/notice";
import { ScoreBadge } from "@/components/score-badge";
import { getUser } from "@/lib/supabase/server";

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const { error, scored, failed, all } = await searchParams;
  const { supabase, user } = await getUser();
  if (!supabase || !user) return <p className="muted">Connect Supabase to use FindSeek.</p>;

  const { data: profile } = await supabase.from("profiles").select("min_match_score").eq("id", user.id).single();
  const minScore = all ? 0 : (profile?.min_match_score ?? 60);
  const { data: matches } = await supabase
    .from("job_matches")
    .select("id, score, strengths, gaps, summary, jobs(id, source, company, title, location, country_code, remote, scam_flags, posted_at)")
    .eq("user_id", user.id)
    .eq("dismissed", false)
    .gte("score", minScore)
    .order("score", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Your matches</h1>
          <p className="muted">
            Showing jobs scoring {minScore}% or more.{" "}
            <Link href={all ? "/jobs" : "/jobs?all=1"} className="underline">{all ? "Hide low matches" : "Show all"}</Link>
          </p>
        </div>
        <form action={findMatches}><button className="btn">Find new matches</button></form>
      </div>
      <Notice error={error} />
      {scored && <p className="muted">Scored {scored} new job{scored === "1" ? "" : "s"}{failed ? `; ${failed} failed and will be retried next time` : ""}.</p>}
      {(matches ?? []).length === 0 && (
        <div className="card muted">No matches yet. Confirm your experience on your profile, then click “Find new matches”.</div>
      )}
      <div className="space-y-3">
        {(matches ?? []).map((m) => {
          const job = Array.isArray(m.jobs) ? m.jobs[0] : m.jobs;
          if (!job) return null;
          return (
            <article key={m.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">{job.title}</Link>
                  <div className="muted">{job.company} · {job.location ?? "Location not listed"}{job.remote ? " · Remote" : ""}</div>
                </div>
                <ScoreBadge score={m.score} />
              </div>
              <p className="mt-3 text-sm">{m.summary}</p>
              {job.scam_flags?.length > 0 && (
                <p className="mt-2 text-sm text-bad">⚠ Possible scam: {job.scam_flags.join("; ")}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link href={`/jobs/${job.id}`} className="btn">Tailor my CV</Link>
                <form action={dismissMatch.bind(null, m.id)}><button className="btn-ghost">Not for me</button></form>
                {job.source === "adzuna" && <span className="ml-auto"><AdzunaAttribution countryCode={job.country_code} /></span>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
