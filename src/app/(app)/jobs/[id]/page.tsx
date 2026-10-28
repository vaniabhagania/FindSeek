import Link from "next/link";
import { notFound } from "next/navigation";
import { approveDocument, markApplied, reportJob, tailorForJob } from "@/app/actions/jobs";
import { AdzunaAttribution } from "@/components/adzuna-attribution";
import { EmployerApply } from "@/components/employer-apply";
import { openingAcceptsApplications } from "@/lib/jobs/opening";
import { Caution, Check, Cross, External, Flag, Shield } from "@/components/icons";
import { JobFacts, type RowJob } from "@/components/job-row";
import { FitLedger, VerificationList } from "@/components/ledger";
import { Notice, Success } from "@/components/notice";
import { ScoreBadge } from "@/components/score-badge";
import type { TailoredCv } from "@/lib/ai/schemas";
import { preferencesOf } from "@/lib/data/profile";
import { fitChecks } from "@/lib/jobs/fit";
import { checkedAgo, ghostSignals, postedAgo } from "@/lib/jobs/freshness";
import type { Check as VerifyCheck } from "@/lib/jobs/verify";
import { getUser } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";

const SEEN_ON: Record<string, string> = {
  linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp", telegram: "Telegram", naukri: "Naukri", x: "X", other: "elsewhere",
};
const REPORTS = [
  { value: "closed", label: "It's closed" },
  { value: "fake", label: "Looks fake" },
  { value: "wrong_pay", label: "Pay is wrong" },
  { value: "not_india", label: "Not open to India" },
];

export default async function JobPage({ params, searchParams }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const { error, added, reported } = await searchParams;
  const { supabase, user } = await getUser();
  if (!supabase || !user) return <p className="muted">Connect Supabase to use FindSeek.</p>;

  const [{ data: job }, { data: match }, { data: application }, { data: profile }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).single(),
    supabase.from("job_matches").select("*").eq("user_id", user.id).eq("job_id", id).maybeSingle(),
    supabase.from("applications").select("*").eq("user_id", user.id).eq("job_id", id).maybeSingle(),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
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

  const checks = (job.verification_checks ?? []) as VerifyCheck[];
  const verified = job.verification_status === "verified";
  const closed = Boolean(job.closed_at);
  const fit = fitChecks(job, preferencesOf(profile));
  const ghosts = ghostSignals(job);
  const live = closed ? null : checkedAgo(job.last_seen_at);
  const failed = checks.filter((c) => !c.ok);

  return (
    <div className="space-y-6">
      <Link href="/jobs" className="btn-quiet -ml-2.5">Back to jobs</Link>

      <header className="flex items-start gap-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-[34px] leading-[1.05] sm:text-[40px]">{job.title}</h1>
          <div className="mt-3"><JobFacts job={job as RowJob} /></div>
          <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-muted">
            {postedAgo(job.posted_at) && <span>{postedAgo(job.posted_at)}</span>}
            {live && <span>{live}</span>}
            {job.source === "user_submitted" && <span>You found this on {SEEN_ON[job.seen_on] ?? "elsewhere"}</span>}
            {job.source === "adzuna" && <AdzunaAttribution countryCode={job.country_code} />}
          </p>
        </div>
        {match && <ScoreBadge score={match.score} />}
      </header>

      <Notice error={error} />
      {added && verified && <Success>This job passed every check. You can tailor your CV for it now. It stays private to you.</Success>}
      {reported && <Success>Thanks. If several other established accounts report the same problem, the listing comes out of everyone&apos;s feed; otherwise a person reviews it.</Success>}
      {closed && (
        <div className="flex items-start gap-2.5 rounded-lg border border-line bg-raised px-4 py-3 text-[15px]">
          <Cross className="mt-1 shrink-0 text-muted" />
          <span>This job has closed. It&apos;s no longer listed at the source{application ? "; it stays in your applications for your records" : ""}.</span>
        </div>
      )}

      {/* Verification record */}
      <section className="panel">
        <div className={`flex items-center gap-2.5 px-5 py-4 ${failed.length ? "" : "border-b border-line"}`}>
          {verified ? <Shield className="text-good" /> : <Caution className="text-blocker" />}
          <h2 className="text-lg">{verified ? "Verified listing" : "Held back"}</h2>
          <span className="text-sm text-muted">
            {verified
              ? `Passed all ${checks.length} checks${job.verified_at ? ` on ${new Date(job.verified_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}`
              : `${failed.length} of ${checks.length} checks failed`}
          </span>
        </div>
        {verified ? (
          <details className="group px-5 pb-1">
            <summary className="cursor-pointer list-none py-3 text-sm text-accent">See what was checked</summary>
            <VerificationList checks={checks} />
          </details>
        ) : (
          <div className="border-t border-line px-5 pb-1">
            <VerificationList checks={checks} />
            <p className="border-t border-line py-3 text-sm text-muted">
              Held-back listings never appear in anyone&apos;s feed, and FindSeek won&apos;t tailor a CV for them.
              {job.source === "user_submitted" && " If the post left something out, find the employer's own listing and bring that instead."}
            </p>
          </div>
        )}
      </section>

      {ghosts.length > 0 && verified && !closed && (
        <div className="rounded-lg border border-caution/30 bg-caution/5 px-4 py-3 text-[15px]">
          <div className="flex items-center gap-2 font-medium text-caution"><Caution /> May not be a live vacancy</div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm">{ghosts.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      )}

      {fit.length > 0 && (
        <section className="space-y-2">
          <h2>For you</h2>
          <FitLedger checks={fit} />
        </section>
      )}

      {match && (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="panel p-5">
            <h3 className="flex items-center gap-2"><Check className="text-good" /> Why you fit</h3>
            <ul className="mt-2.5 space-y-1.5 text-[15px]">{match.strengths.map((s: string) => <li key={s}>{s}</li>)}</ul>
          </div>
          <div className="panel p-5">
            <h3 className="flex items-center gap-2"><Caution className="text-caution" /> What to prepare</h3>
            <ul className="mt-2.5 space-y-1.5 text-[15px]">{match.gaps.map((s: string) => <li key={s}>{s}</li>)}</ul>
          </div>
        </section>
      )}

      {verified && !closed && (
        <section className="panel p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>Tailored CV {doc && <span className="text-sm font-normal text-muted">Version {doc.version}</span>}</h2>
            <form action={tailorForJob.bind(null, job.id)}>
              <SubmitButton className={doc ? "btn-ghost" : "btn"} working="Reading the job and your profile…">{doc ? "Regenerate" : "Tailor my CV for this job"}</SubmitButton>
            </form>
          </div>
          {!doc && <p className="mt-2 muted">Takes about a minute. Uses only the facts you&apos;ve confirmed. We check the job is still open first.</p>}

          {doc && cv && (
            <div className="mt-5 space-y-5">
              {doc.fabrication_warnings.length > 0 && (
                <div className="rounded-lg border border-caution/40 bg-caution/5 px-4 py-3 text-sm">
                  <strong className="text-caution">Check these before approving</strong>
                  <ul className="mt-1 list-disc pl-5">{doc.fabrication_warnings.map((w: string) => <li key={w}>{w}</li>)}</ul>
                </div>
              )}
              <div>
                <div className="font-medium">{cv.headline}</div>
                <p className="mt-1 text-[15px]">{cv.summary}</p>
              </div>
              {cv.experiences.map((e) => (
                <div key={e.source_id + e.title}>
                  <div className="text-[15px] font-medium">
                    {e.title}, {e.organisation} <span className="font-normal text-muted">{e.start_date ?? ""} to {e.end_date ?? "present"}</span>
                  </div>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[15px]">{e.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
                </div>
              ))}
              <div className="text-[15px]"><span className="font-medium">Skills:</span> {cv.skills.join(", ")}</div>
              {cv.keywords_missing.length > 0 && (
                <div className="text-[15px]"><span className="font-medium">Not claimed, because you don&apos;t have evidence yet:</span> {cv.keywords_missing.join(", ")}</div>
              )}
              <details>
                <summary className="cursor-pointer text-sm font-medium">What changed ({doc.change_log.length})</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{doc.change_log.map((c: string) => <li key={c}>{c}</li>)}</ul>
              </details>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Cover letter</summary>
                <p className="mt-2 whitespace-pre-wrap text-[15px]">{doc.cover_letter}</p>
              </details>

              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                {doc.approved_at ? (
                  <>
                    <span className="flex items-center gap-1.5 text-sm text-good"><Check /> Approved</span>
                    <Link href={`/jobs/${job.id}/cv`} className="btn-ghost">Download PDF</Link>
                    {!post && (
                      <>
                        <a href={job.apply_url} target="_blank" rel="noopener" className="btn">Open application page <External /></a>
                        {application && application.status !== "applied" && (
                          <form action={markApplied.bind(null, job.id, application.id)}>
                            <SubmitButton className="btn-ghost" working="Saving…">I&apos;ve submitted it</SubmitButton>
                          </form>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <form action={approveDocument.bind(null, job.id, doc.id)} className="flex flex-wrap items-center gap-3">
                    {doc.fabrication_warnings.length > 0 && (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="ack_warnings" /> I&apos;ve checked the warnings and everything is true
                      </label>
                    )}
                    <SubmitButton working="Approving…">Approve this CV</SubmitButton>
                  </form>
                )}
              </div>
              {post && doc.approved_at && application && (
                <EmployerApply jobId={job.id} applicationId={application.id} company={job.company} postStatus={openingAcceptsApplications(post.status, job) ? "open" : "closed"} submission={submission} />
              )}
            </div>
          )}
        </section>
      )}

      <section className="panel p-5 sm:p-6">
        <h2>Job description</h2>
        <p className="mt-3 max-w-[72ch] whitespace-pre-wrap text-[15px] leading-relaxed">{job.description}</p>
        {job.source === "adzuna" && <p className="mt-3 muted">This is a summary. The full ad is on the application page.</p>}
      </section>

      {job.source !== "user_submitted" && (
        <details className="panel px-5 py-1">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-3 text-sm text-muted"><Flag /> Report a problem with this listing</summary>
          <form action={reportJob.bind(null, job.id)} className="space-y-3 pb-4">
            <div className="flex flex-wrap gap-2">
              {REPORTS.map((r, i) => (
                <label key={r.value} className="chip"><input type="radio" name="reason" value={r.value} defaultChecked={i === 0} />{r.label}</label>
              ))}
            </div>
            <input name="note" maxLength={500} className="input" placeholder="What did you see? (optional)" />
            <SubmitButton className="btn-ghost" working="Sending…">Send report</SubmitButton>
          </form>
        </details>
      )}
    </div>
  );
}
