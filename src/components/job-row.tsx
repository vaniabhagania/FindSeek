import Link from "next/link";
import { formatPayRange } from "@/lib/india/pay";
import type { FitCheck } from "@/lib/jobs/fit";
import { checkedAgo, postedAgo } from "@/lib/jobs/freshness";
import { FitLedger } from "./ledger";
import { ScoreBadge } from "./score-badge";

export interface RowJob {
  id: string;
  company: string;
  title: string;
  location: string | null;
  cities: string[] | null;
  work_mode: string | null;
  job_type: string | null;
  pay_min_inr: number | null;
  pay_max_inr: number | null;
  pay_period: "year" | "month" | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  posted_at: string | null;
  last_seen_at?: string | null;
}

const TYPE: Record<string, string> = {
  internship: "Internship", part_time: "Part-time", contract: "Contract", apprenticeship: "Apprenticeship", full_time: "Full-time",
};
const MODE: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

export function payLabel(job: Pick<RowJob, "pay_min_inr" | "pay_max_inr" | "pay_period" | "salary_min" | "salary_max" | "salary_currency">): string | null {
  if (job.pay_max_inr != null || job.pay_min_inr != null) {
    const min = Number(job.pay_min_inr ?? job.pay_max_inr);
    const max = Number(job.pay_max_inr ?? job.pay_min_inr);
    return formatPayRange({ minAnnualInr: min, maxAnnualInr: max, period: job.pay_period ?? "year", unpaid: max === 0 });
  }
  if (job.salary_currency && (job.salary_min || job.salary_max)) {
    const f = (n: number) => `${Math.round(n / 1000)}k`;
    const lo = job.salary_min ?? job.salary_max!;
    const hi = job.salary_max ?? job.salary_min!;
    return `${job.salary_currency} ${lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`} a year`;
  }
  return null;
}

/** Where, how, what kind: separate facts, so each can be scanned on its own. */
export function JobFacts({ job }: { job: RowJob }) {
  // "Remote, India" next to a "Remote" work mode says the same thing twice.
  const where = job.cities?.length
    ? job.cities.join(", ")
    : job.work_mode === "remote" && /remote/i.test(job.location ?? "") ? null : job.location;
  const pay = payLabel(job);
  const facts = [
    where,
    job.work_mode ? MODE[job.work_mode] : null,
    job.job_type && job.job_type !== "full_time" ? TYPE[job.job_type] : null,
  ].filter(Boolean) as string[];
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted">
      <span className="font-medium text-ink">{job.company}</span>
      {facts.map((f) => <span key={f}>{f}</span>)}
      {pay && <span className="figure text-[15px] font-semibold text-ink">{pay}</span>}
    </div>
  );
}

export function JobRow({
  job, checks, score, summary, children,
}: {
  job: RowJob;
  checks: FitCheck[];
  score?: number;
  summary?: string | null;
  children?: React.ReactNode;
}) {
  const live = checkedAgo(job.last_seen_at) ?? postedAgo(job.posted_at);
  return (
    <article className="px-4 py-5 sm:px-6">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <Link href={`/jobs/${job.id}`} className="display block text-[21px] font-semibold leading-tight hover:text-accent">
            {job.title}
          </Link>
          <div className="mt-1.5"><JobFacts job={job} /></div>
        </div>
        {score != null && <ScoreBadge score={score} />}
      </div>
      {summary && <p className="mt-3 max-w-[68ch] text-[15px]">{summary}</p>}
      <div className="mt-3"><FitLedger checks={checks} live={live} /></div>
      {children && <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div>}
    </article>
  );
}
