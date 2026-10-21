import Link from "next/link";
import { redirect } from "next/navigation";
import { findMatches } from "@/app/actions/jobs";
import { JobRow, type RowJob } from "@/components/job-row";
import { preferencesOf } from "@/lib/data/profile";
import { JOB_FEED_COLUMNS } from "@/lib/jobs/feed";
import { fitChecks, fitSummary, type FitJob } from "@/lib/jobs/fit";
import { getUser } from "@/lib/supabase/server";

export default async function Dashboard() {
  const { supabase, user } = await getUser();
  if (!supabase || !user) return <p className="muted">Connect Supabase to use FindSeek.</p>;

  const [{ data: profile }, { count: confirmed }, { count: toReview }, { data: matches }, { data: apps }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("experiences").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("confirmed", true),
    supabase.from("experiences").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("confirmed", false),
    supabase
      .from("job_matches")
      .select(`id, score, summary, jobs(${JOB_FEED_COLUMNS})`)
      .eq("user_id", user.id)
      .eq("dismissed", false)
      .order("score", { ascending: false })
      .limit(20),
    supabase.from("applications").select("status").eq("user_id", user.id),
  ]);

  // First visit goes straight into setup rather than an empty dashboard.
  if (!profile?.onboarding_completed_at && !(profile?.target_roles ?? []).length) redirect("/onboarding");

  const prefs = preferencesOf(profile);
  const byStatus = (s: string) => (apps ?? []).filter((a) => a.status === s).length;
  const open = (matches ?? [])
    .map((m) => ({ ...m, job: (Array.isArray(m.jobs) ? m.jobs[0] : m.jobs) as unknown as RowJob & FitJob & { closed_at: string | null; verification_status: string } }))
    .filter((m) => m.job && !m.job.closed_at && m.job.verification_status === "verified")
    .map((m) => ({ ...m, checks: fitChecks(m.job, prefs) }))
    .filter((m) => fitSummary(m.checks).blockers === 0);

  const next = !(profile?.target_roles ?? []).length
    ? { text: "Tell FindSeek what you're looking for.", cta: "Set up my search", href: "/onboarding" }
    : (confirmed ?? 0) === 0
      ? (toReview ?? 0) > 0
        ? { text: `${toReview} items from your CV are waiting for you to confirm. Only confirmed facts are used.`, cta: "Review them", href: "/profile" }
        : { text: "Add your CV so FindSeek can match and tailor.", cta: "Add my CV", href: "/onboarding?step=cv" }
      : byStatus("ready") > 0
        ? { text: `${byStatus("ready")} tailored CV${byStatus("ready") === 1 ? " is" : "s are"} ready to send.`, cta: "Open applications", href: "/tracker" }
        : open.length === 0
          ? { text: "Score today's verified openings against your profile.", cta: "Find new matches", action: true as const }
          : { text: `${open.length} verified match${open.length === 1 ? "" : "es"} fit your rules.`, cta: "See matches", href: "/jobs" };

  const first = profile?.full_name?.split(" ")[0];

  return (
    <div className="space-y-8">
      <header>
        <h1>{first ? `Hi ${first}` : "Today"}</h1>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft px-5 py-4">
          <p className="text-[15px]">{next.text}</p>
          {"action" in next ? (
            <form action={findMatches}><button className="btn">{next.cta}</button></form>
          ) : (
            <Link href={next.href} className="btn">{next.cta}</Link>
          )}
        </div>
      </header>

      <section className="panel grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-line sm:[&>*:nth-child(-n+2)]:border-b-0">
        {[
          ["Matches", open.length],
          ["Ready to send", byStatus("ready")],
          ["Applied", byStatus("applied")],
          ["Interviews", byStatus("interview")],
        ].map(([label, value]) => (
          <div key={label} className="px-5 py-4">
            <div className="figure text-[32px] leading-none font-semibold">{value}</div>
            <div className="mt-1.5 text-sm text-muted">{label}</div>
          </div>
        ))}
      </section>

      {open.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2>Best matches right now</h2>
            <Link href="/jobs" className="text-sm text-accent hover:underline">All matches</Link>
          </div>
          <div className="panel divide-y divide-line">
            {open.slice(0, 3).map((m) => (
              <JobRow key={m.id} job={m.job} checks={m.checks} score={m.score} summary={m.summary} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
