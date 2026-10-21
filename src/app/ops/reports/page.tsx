import { notFound } from "next/navigation";
import { resolveReports } from "@/app/actions/ops";
import { Notice, Success } from "@/components/notice";
import { ReportCard, type QueueJob, type QueueRow } from "@/components/report-card";
import { getOperator } from "@/lib/ops/session";

export default async function ReportQueue({ searchParams }: PageProps<"/ops/reports">) {
  const operator = await getOperator();
  if (!operator) notFound();
  const { error, done } = await searchParams;

  const { data: queue } = await operator.admin.rpc("report_queue");
  const rows = (queue ?? []) as QueueRow[];
  const ids = [...new Set(rows.map((r) => r.job_id))];
  const { data: jobData } = ids.length
    ? await operator.admin.from("jobs").select("id, title, company, source, apply_url, verification_status, closed_at").in("id", ids)
    : { data: [] };
  const jobs = new Map(((jobData ?? []) as QueueJob[]).map((j) => [j.id, j]));

  return (
    <div className="space-y-6">
      <header>
        <h1>Reports waiting for a decision</h1>
        <p className="mt-2 max-w-2xl text-muted">
          A listing comes out of the feed by itself only when at least three people report the same problem and their
          combined weight reaches 4. Everything else waits here. Weight reflects how established the reporter is: account
          age, finished profile, applications made, and whether earlier reports held up.
        </p>
      </header>

      <Notice error={error} />
      {done === "pulled" && <Success>Confirmed. The listing is out of the feed and those reporters are credited.</Success>}
      {done === "restored" && <Success>Dismissed. The listing is back in the feed if nothing else holds it, and those reporters&apos; weight went down.</Success>}

      {rows.length === 0 && <p className="muted">Nothing is waiting. New reports show up here.</p>}

      <div className="space-y-3">
        {rows.map((r) => {
          const job = jobs.get(r.job_id);
          return job ? <ReportCard key={`${r.job_id}-${r.reason}`} row={r} job={job} action={resolveReports.bind(null, r.job_id, r.reason)} /> : null;
        })}
      </div>
    </div>
  );
}
