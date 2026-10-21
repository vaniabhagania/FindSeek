import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { decideCandidate, saveEmailDraft, sendOutcomeEmail } from "@/app/actions/admin";
import { RecommendationBadge, StatusChip } from "@/components/admin/recommendation-badge";
import { Notice } from "@/components/notice";
import type { ApplicationSnapshot } from "@/lib/ai/screen-candidate";
import type { Criterion, CriterionResult, Recommendation } from "@/lib/admin/screening";
import { getRecruiter } from "@/lib/admin/session";
import { isEmailConfigured } from "@/lib/env";
import { SubmitButton } from "@/components/submit-button";

const KIND_LABEL: Record<string, string> = {
  hard_requirement: "Hard requirement",
  must_have: "Must-have",
  nice_to_have: "Nice-to-have",
};
const RESULT: Record<string, { text: string; tone: string }> = {
  met: { text: "Met", tone: "text-good" },
  not_met: { text: "Not met", tone: "text-bad" },
  unclear: { text: "Unclear", tone: "text-warn" },
};

export default async function CandidatePage({ params, searchParams }: PageProps<"/admin/posts/[id]/candidates/[applicationId]">) {
  const { id, applicationId } = await params;
  const { error, decided, saved, sent } = await searchParams;
  const { supabase, user, employer } = await getRecruiter();
  if (!supabase || !user) return <p className="muted">Connect Supabase to use FindSeek.</p>;
  if (!employer) redirect("/admin");

  const { data: post } = await supabase
    .from("job_posts").select("id, title").eq("id", id).eq("employer_id", employer.id).maybeSingle();
  if (!post) notFound();
  const { data: application } = await supabase
    .from("post_applications").select("*").eq("id", applicationId).eq("job_post_id", post.id).maybeSingle();
  if (!application) notFound();

  const [{ data: screening }, { data: decision }, { data: email }, { data: criteriaRows }] = await Promise.all([
    supabase.from("candidate_screenings").select("*").eq("post_application_id", application.id).maybeSingle(),
    supabase.from("hiring_decisions").select("*").eq("post_application_id", application.id).maybeSingle(),
    supabase.from("candidate_emails").select("*").eq("post_application_id", application.id).maybeSingle(),
    supabase.from("screening_criteria").select("id, kind, text").eq("job_post_id", post.id).order("created_at"),
  ]);

  const snapshot = application.snapshot as ApplicationSnapshot;
  const criteria = (criteriaRows ?? []) as Criterion[];
  const results = new Map(((screening?.criteria_results ?? []) as CriterionResult[]).map((r) => [r.criterion_id, r]));
  const locked = email?.status === "sent";
  const withdrawn = application.status === "withdrawn";
  const base = `/admin/posts/${post.id}`;

  return (
    <div className="space-y-6">
      <Link href={base} className="muted underline">← {post.title}</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{application.candidate_name ?? "Candidate"}</h1>
          <p className="muted">
            Applied {new Date(application.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            {snapshot.location ? ` · ${snapshot.location}` : ""}
          </p>
        </div>
        <StatusChip status={application.status} />
      </header>
      <Notice error={error} />
      {decided && <Banner>Decision recorded. Review the email below, then send it when you’re ready.</Banner>}
      {saved && <Banner>Draft saved.</Banner>}
      {sent && <Banner>Email sent to the candidate.</Banner>}
      {withdrawn && <Banner>This candidate has withdrawn their application.</Banner>}

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">AI brief</h2>
          {screening && <RecommendationBadge recommendation={screening.recommendation as Recommendation} score={screening.score} />}
        </div>
        <p className="muted">
          A suggestion to help you organise applications, not a decision. The score comes from the criteria below using fixed rules;
          the AI only reports what each CV evidences. The candidate’s name was not shown to it.
        </p>
        {!screening ? (
          <p className="text-sm">Not screened yet. Go back to the opening and choose “Screen new candidates”.</p>
        ) : (
          <>
            {screening.summary && <p className="text-sm">{screening.summary}</p>}
            <div>
              <h3 className="text-sm font-medium">How this was reached</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {screening.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="muted"><tr><th className="py-2 pr-4 font-medium">Criterion</th><th className="py-2 pr-4 font-medium">Result</th><th className="py-2 font-medium">Evidence</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {criteria.map((c) => {
                    const r = results.get(c.id);
                    const tone = r ? RESULT[r.status] : null;
                    return (
                      <tr key={c.id} className="align-top">
                        <td className="py-2 pr-4"><div>{c.text}</div><div className="muted">{KIND_LABEL[c.kind]}</div></td>
                        <td className={`py-2 pr-4 font-medium ${tone?.tone ?? "text-muted"}`}>{tone?.text ?? "Not assessed"}</td>
                        <td className="py-2">{r?.evidence ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Application</h2>
        <div>
          <div className="font-medium">{snapshot.cv.headline}</div>
          <p className="mt-1 text-sm">{snapshot.cv.summary}</p>
        </div>
        {snapshot.cv.experiences.map((e) => (
          <div key={e.source_id + e.title}>
            <div className="text-sm font-medium">{e.title} · {e.organisation} <span className="muted">{e.start_date ?? ""} – {e.end_date ?? "present"}</span></div>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{e.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        ))}
        <div className="text-sm"><span className="font-medium">Skills:</span> {snapshot.cv.skills.join(", ")}</div>
        {snapshot.cover_letter && (
          <details>
            <summary className="cursor-pointer text-sm font-medium">Cover letter</summary>
            <p className="mt-2 whitespace-pre-wrap text-sm">{snapshot.cover_letter}</p>
          </details>
        )}
      </section>

      {!withdrawn && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Your decision</h2>
          {decision && (
            <p className="text-sm">
              Recorded: <strong>{decision.decision === "selected" ? "Selected" : "Not selected"}</strong>
              {decision.ai_recommendation && <> (the AI suggested “{decision.ai_recommendation}”)</>}
            </p>
          )}
          {locked ? (
            <p className="muted">The outcome email has been sent, so the decision is final.</p>
          ) : (
            <form action={decideCandidate.bind(null, post.id, application.id)} className="space-y-3">
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="decision" value="selected" defaultChecked={decision?.decision === "selected"} required /> Select for the next step
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="decision" value="not_selected" defaultChecked={decision?.decision === "not_selected"} /> Not selected
                </label>
              </div>
              <div>
                <label className="label" htmlFor="note">Internal note (never sent to the candidate)</label>
                <textarea id="note" name="note" rows={3} maxLength={1000} defaultValue={decision?.note ?? ""} className="input" />
              </div>
              <button className="btn">{decision ? "Update decision" : "Record decision"}</button>
            </form>
          )}
        </section>
      )}

      {email && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Email to the candidate</h2>
            <span className={`text-sm ${email.status === "sent" ? "text-good" : email.status === "failed" ? "text-bad" : "text-muted"}`}>
              {email.status === "sent" ? "Sent" : email.status === "failed" ? "Failed to send" : "Draft, not sent yet"}
            </span>
          </div>
          {locked ? (
            <>
              <div className="text-sm font-medium">{email.subject}</div>
              <p className="whitespace-pre-wrap text-sm">{email.body}</p>
            </>
          ) : (
            <form action={saveEmailDraft.bind(null, post.id, application.id)} className="space-y-3">
              <div>
                <label className="label" htmlFor="subject">Subject</label>
                <input id="subject" name="subject" defaultValue={email.subject} required maxLength={200} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="body">Message</label>
                <textarea id="body" name="body" rows={12} defaultValue={email.body} required minLength={20} maxLength={5000} className="input" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton className="btn-ghost" working="Saving…">Save draft</SubmitButton>
                <SubmitButton formAction={sendOutcomeEmail.bind(null, post.id, application.id)} disabled={!isEmailConfigured} working="Sending…">
                  Send to candidate
                </SubmitButton>
              </div>
              <p className="muted">
                {isEmailConfigured
                  ? "Sending saves your edits first. Replies go to your email address. Once sent, the decision is final."
                  : "Email isn’t set up yet (RESEND_API_KEY and EMAIL_FROM), so drafts can be written but not sent."}
              </p>
            </form>
          )}
        </section>
      )}
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-good/40 bg-good/5 px-4 py-3 text-sm">{children}</div>;
}
