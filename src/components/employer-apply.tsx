import { submitToEmployer, withdrawFromEmployer } from "@/app/actions/jobs";

interface Props {
  jobId: string;
  applicationId: string;
  company: string;
  postStatus: string;
  submission: { status: string; submitted_at: string } | null;
}

/** Candidate-facing apply panel for openings posted by an employer on FindSeek. */
export function EmployerApply({ jobId, applicationId, company, postStatus, submission }: Props) {
  if (submission) {
    const date = new Date(submission.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const withdrawn = submission.status === "withdrawn";
    const canWithdraw = submission.status === "submitted" || submission.status === "screened";
    const decided = submission.status === "selected" || submission.status === "not_selected";
    return (
      <div className="rounded-lg border border-border px-4 py-3 text-sm">
        {withdrawn ? (
          <p>You withdrew your application to {company}. Your CV is no longer visible to them.</p>
        ) : (
          <>
            <p className="text-good">✓ Submitted to {company} on {date}.</p>
            <p className="mt-1 muted">
              {decided
                ? "The employer has finished reviewing. Any outcome is sent to you by email."
                : "A person at the employer reviews every application. AI only helps them organise it. You'll hear by email."}
            </p>
          </>
        )}
        {canWithdraw && (
          <form action={withdrawFromEmployer.bind(null, jobId)} className="mt-3">
            <button className="btn-ghost">Withdraw my application</button>
          </form>
        )}
      </div>
    );
  }

  if (postStatus !== "open") {
    return <p className="rounded-lg border border-border px-4 py-3 text-sm muted">This opening is closed and no longer accepting applications.</p>;
  }

  return (
    <form action={submitToEmployer.bind(null, jobId, applicationId)} className="space-y-3 rounded-lg border border-border px-4 py-3">
      <p className="text-sm font-medium">Apply to {company} through FindSeek</p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent_share" className="mt-1" />
        <span>I agree that FindSeek shares this approved CV and cover letter, and my name, with {company}.</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent_screening" className="mt-1" />
        <span>
          I understand {company} may use AI to help assess applications against their criteria, and that a person makes the
          final decision. I can withdraw my application or ask for my data to be deleted at any time.
        </span>
      </label>
      <button className="btn">Submit my application</button>
    </form>
  );
}
