import Link from "next/link";
import { notFound } from "next/navigation";
import { approveDocument, markApplied, tailorForJob } from "@/app/actions/jobs";
import { AdzunaAttribution } from "@/components/adzuna-attribution";
import { EmployerApply } from "@/components/employer-apply";
import { Notice } from "@/components/notice";
import { ScoreBadge } from "@/components/score-badge";
import type { TailoredCv } from "@/lib/ai/schemas";
import { getUser } from "@/lib/supabase/server";

export default async function JobPage({ params, searchParams }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase, user } = await getUser();
  if (!supabase || !user) return <p className="muted">Connect Supabase to use FindSeek.</p>;

  const [{ data: job }, { data: match }, { data: application }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).single(),
    supabase.from("job_matches").select("*").eq("user_id", user.id).eq("job_id", id).maybeSingle(),
    supabase.from("applications").select("*").eq("user_id", user.id).eq("job_id", id).maybeSingle(),
  ]);
  if (!job) notFound();

  const { data: doc } = application
    ? await supabase.from("tailored_documents").select("*").eq("application_id", application.id)
        .order("version", { ascending: false }).limit(1).maybeSingle()
    : { data: null };

  // Openings posted by an employer on FindSeek are applied to here rather than on an external site.
  const { data: post } = await supabase.from("job_posts").select("id, status").eq("job_id", id).maybeSingle();
  const { data: submission } = post
    ? await supabase.from("post_applications").select("status, submitted_at").eq("job_post_id", post.id).eq("user_id", user.id).maybeSingle()
    : { data: null };
  const cv = doc?.cv as TailoredCv | undefined;

  return (
    <div className="space-y-6">
      <Link href="/jobs" className="muted underline">← All matches</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          <p className="muted">{job.company} · {job.location ?? "Location not listed"}</p>
          {job.source === "adzuna" && <AdzunaAttribution countryCode={job.country_code} />}
        </div>
        {match && <ScoreBadge score={match.score} />}
      </header>
      <Notice error={error} />
      {job.scam_flags?.length > 0 && (
        <div className="rounded-lg border border-bad/40 bg-bad/5 px-4 py-3 text-sm text-bad">
          ⚠ This listing has warning signs: {job.scam_flags.join("; ")}. Never pay to apply or share bank details.
        </div>
      )}

      {match && (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="card">
            <h2 className="font-semibold text-good">Why you fit</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{match.strengths.map((s: string) => <li key={s}>{s}</li>)}</ul>
          </div>
          <div className="card">
            <h2 className="font-semibold text-warn">Gaps to prepare for</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{match.gaps.map((s: string) => <li key={s}>{s}</li>)}</ul>
          </div>
        </section>
      )}

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Tailored CV {doc && <span className="muted">· version {doc.version}</span>}</h2>
          <form action={tailorForJob.bind(null, job.id)}>
            <button className="btn">{doc ? "Regenerate" : "Tailor my CV for this job"}</button>
          </form>
        </div>
        {!doc && <p className="mt-2 muted">Takes about a minute. Uses only the facts you’ve confirmed.</p>}

        {doc && cv && (
          <div className="mt-5 space-y-5">
            {doc.fabrication_warnings.length > 0 && (
              <div className="rounded-lg border border-warn/50 bg-warn/5 px-4 py-3 text-sm">
                <strong className="text-warn">Check these before approving:</strong>
                <ul className="mt-1 list-disc pl-5">{doc.fabrication_warnings.map((w: string) => <li key={w}>{w}</li>)}</ul>
              </div>
            )}
            <div>
              <div className="font-medium">{cv.headline}</div>
              <p className="mt-1 text-sm">{cv.summary}</p>
            </div>
            {cv.experiences.map((e) => (
              <div key={e.source_id + e.title}>
                <div className="text-sm font-medium">{e.title} · {e.organisation} <span className="muted">{e.start_date ?? ""} – {e.end_date ?? "present"}</span></div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{e.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
              </div>
            ))}
            <div className="text-sm"><span className="font-medium">Skills:</span> {cv.skills.join(", ")}</div>
            {cv.keywords_missing.length > 0 && (
              <div className="text-sm"><span className="font-medium">Not claimed (you don’t have evidence yet):</span> {cv.keywords_missing.join(", ")}</div>
            )}
            <details>
              <summary className="cursor-pointer text-sm font-medium">What changed ({doc.change_log.length})</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{doc.change_log.map((c: string) => <li key={c}>{c}</li>)}</ul>
            </details>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Cover letter</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm">{doc.cover_letter}</p>
            </details>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              {doc.approved_at ? (
                <>
                  <span className="text-sm text-good">✓ Approved</span>
                  <Link href={`/jobs/${job.id}/cv`} className="btn-ghost">Download PDF</Link>
                  {!post && (
                    <>
                      <a href={job.apply_url} target="_blank" rel="noopener" className="btn">Open application page ↗</a>
                      {application && application.status !== "applied" && (
                        <form action={markApplied.bind(null, job.id, application.id)}>
                          <button className="btn-ghost">I’ve submitted it</button>
                        </form>
                      )}
                    </>
                  )}
                </>
              ) : (
                <form action={approveDocument.bind(null, job.id, doc.id)} className="flex flex-wrap items-center gap-3">
                  {doc.fabrication_warnings.length > 0 && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="ack_warnings" /> I’ve checked the warnings and everything is true
                    </label>
                  )}
                  <button className="btn">Approve this CV</button>
                </form>
              )}
            </div>
            {post && doc.approved_at && application && (
              <EmployerApply
                jobId={job.id}
                applicationId={application.id}
                company={job.company}
                postStatus={post.status}
                submission={submission}
              />
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="font-semibold">Job description</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm">{job.description}</p>
        {job.source === "adzuna" && <p className="mt-2 muted">This is a summary. The full ad is on the application page.</p>}
      </section>
    </div>
  );
}
