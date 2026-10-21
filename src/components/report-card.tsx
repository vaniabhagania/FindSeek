import { SubmitButton } from "@/components/submit-button";

export const REASON_LABEL: Record<string, string> = {
  closed: "Says it is closed",
  fake: "Looks fake",
  wrong_pay: "Pay is wrong",
  not_india: "Not open to India",
};

export interface QueueRow {
  job_id: string;
  reason: string;
  reporters: number;
  total_weight: number;
  newest: string;
  notes: string[] | null;
}

export interface QueueJob {
  id: string;
  title: string;
  company: string;
  source: string;
  apply_url: string;
  verification_status: string;
  closed_at: string | null;
}

/** Where the listing really points, for the reviewer to open. Only https links; anything else is shown as text. */
export function sourceHost(url: string): { href: string | null; text: string } {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? { href: u.href, text: u.hostname } : { href: null, text: url.slice(0, 60) };
  } catch {
    return { href: null, text: url.startsWith("/") ? "posted on FindSeek" : url.slice(0, 60) };
  }
}

/** One listing with open reports, and the two things a reviewer can do about it. */
export function ReportCard({ row, job, action }: { row: QueueRow; job: QueueJob; action: (formData: FormData) => void | Promise<void> }) {
  const src = sourceHost(job.apply_url);
  const state = job.closed_at ? "Closed" : job.verification_status === "verified" ? "In the feed" : "Held back";
  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg">{job.title}</h2>
          <p className="text-sm text-muted">
            {job.company} · {job.source.replace("_", " ")} ·{" "}
            {src.href ? (
              <a href={src.href} target="_blank" rel="noopener noreferrer nofollow" className="underline">{src.text}</a>
            ) : (
              src.text
            )}
          </p>
        </div>
        <span className="rounded-md border border-line px-2 py-1 text-sm">{state}</span>
      </div>

      <p className="mt-3 text-[15px]">
        <strong>{REASON_LABEL[row.reason] ?? row.reason}</strong> · {row.reporters} {row.reporters === 1 ? "person" : "people"} ·
        weight <span className="figure">{Number(row.total_weight).toFixed(1)}</span> of 4
      </p>

      {(row.notes ?? []).length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {(row.notes ?? []).slice(0, 5).map((n, i) => (
            <li key={i} className="border-l-2 border-line pl-3">{n}</li>
          ))}
        </ul>
      )}

      <form action={action} className="mt-4 flex flex-wrap gap-2">
        <SubmitButton name="decision" value="confirm" className="btn" working="Pulling the listing…">
          {row.reason === "closed" ? "Confirm: it's closed" : "Confirm: pull the listing"}
        </SubmitButton>
        <SubmitButton name="decision" value="dismiss" className="btn-ghost" working="Dismissing…">
          Dismiss: keep it listed
        </SubmitButton>
      </form>
    </section>
  );
}
