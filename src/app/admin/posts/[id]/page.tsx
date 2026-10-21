import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addCriterion, closePost, deleteCriterion, publishPost, screenCandidates } from "@/app/actions/admin";
import { RecommendationBadge, StatusChip } from "@/components/admin/recommendation-badge";
import { Notice } from "@/components/notice";
import type { Recommendation } from "@/lib/admin/screening";
import { getRecruiter } from "@/lib/admin/session";

const KIND_LABEL: Record<string, string> = {
  hard_requirement: "Hard requirement",
  must_have: "Must-have",
  nice_to_have: "Nice-to-have",
};

export default async function PostPage({ params, searchParams }: PageProps<"/admin/posts/[id]">) {
  const { id } = await params;
  const { error, screened, failed } = await searchParams;
  const { supabase, user, employer } = await getRecruiter();
  if (!supabase || !user) return <p className="muted">Connect Supabase to use FindSeek.</p>;
  if (!employer) redirect("/admin");

  const { data: post } = await supabase
    .from("job_posts").select("*").eq("id", id).eq("employer_id", employer.id).maybeSingle();
  if (!post) notFound();

  const [{ data: criteria }, { data: applications }] = await Promise.all([
    supabase.from("screening_criteria").select("id, kind, text").eq("job_post_id", post.id).order("created_at"),
    supabase.from("post_applications").select("id, candidate_name, status, submitted_at").eq("job_post_id", post.id).order("submitted_at", { ascending: false }),
  ]);
  const ids = (applications ?? []).map((a) => a.id);
  const { data: screenings } = ids.length
    ? await supabase.from("candidate_screenings").select("post_application_id, score, recommendation").in("post_application_id", ids)
    : { data: [] };
  const screeningOf = new Map((screenings ?? []).map((s) => [s.post_application_id, s]));

  // Highest score first; unscreened candidates after, newest first.
  const rows = [...(applications ?? [])].sort((a, b) => {
    const sa = screeningOf.get(a.id)?.score ?? -1;
    const sb = screeningOf.get(b.id)?.score ?? -1;
    return sb - sa;
  });
  const waitingToScreen = (applications ?? []).filter((a) => a.status === "submitted").length;

  return (
    <div className="space-y-6">
      <Link href="/admin" className="muted underline">← Openings</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{post.title}</h1>
          <p className="muted">
            {post.location ?? "Location not listed"} ·{" "}
            <span className={post.status === "open" ? "text-good" : ""}>
              {post.status === "open" ? "Open to applicants" : post.status === "closed" ? "Closed" : "Draft, not visible to candidates"}
            </span>
          </p>
        </div>
        {post.status === "open" ? (
          <form action={closePost.bind(null, post.id)}><button className="btn-ghost">Close opening</button></form>
        ) : (
          <form action={publishPost.bind(null, post.id)}>
            <button className="btn">{post.status === "closed" ? "Reopen" : "Publish"}</button>
          </form>
        )}
      </header>
      <Notice error={error} />
      {screened && (
        <div className="rounded-lg border border-good/40 bg-good/5 px-4 py-3 text-sm">
          Screened {String(screened)} candidate{screened === "1" ? "" : "s"}.{failed ? ` ${String(failed)} couldn't be screened; try again.` : ""} These are suggestions: open each brief to decide.
        </div>
      )}

      <section className="card">
        <h2 className="font-semibold">Screening criteria</h2>
        <p className="mt-1 muted">
          Tell the AI what to look for. It reports whether each applicant’s CV evidences it, and shows its reasoning. Hard
          requirements are things a candidate can’t do the job without, such as the right to work in a country.
        </p>
        <ul className="mt-4 space-y-2">
          {(criteria ?? []).length === 0 && <li className="muted">No criteria yet.</li>}
          {(criteria ?? []).map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 text-sm">
              <span><span className="font-medium">{KIND_LABEL[c.kind]}:</span> {c.text}</span>
              <form action={deleteCriterion.bind(null, post.id, c.id)}>
                <button className="text-xs text-muted underline">Remove</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addCriterion.bind(null, post.id)} className="mt-4 grid gap-3 sm:grid-cols-[11rem_1fr_auto]">
          <select name="kind" defaultValue="must_have" aria-label="Kind of criterion" className="input">
            <option value="must_have">Must-have</option>
            <option value="nice_to_have">Nice-to-have</option>
            <option value="hard_requirement">Hard requirement</option>
          </select>
          <input name="text" required minLength={3} maxLength={300} aria-label="Criterion" className="input" placeholder="e.g. 5+ years of Python, or fluent in German (C1)" />
          <button className="btn">Add</button>
        </form>
        <p className="mt-2 muted">
          Criteria about age, gender, nationality, religion, family status, health and other protected characteristics are blocked.
          Changing criteria clears the briefs of undecided candidates so they’re screened afresh.
        </p>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Candidates <span className="muted">{(applications ?? []).length}</span></h2>
          {waitingToScreen > 0 && (
            <form action={screenCandidates.bind(null, post.id)}>
              <button className="btn">Screen {Math.min(waitingToScreen, 10)} new candidate{waitingToScreen === 1 ? "" : "s"}</button>
            </form>
          )}
        </div>
        {rows.length === 0 && (
          <p className="mt-3 muted">
            {post.status === "open" ? "No applications yet." : "Publish the opening to start receiving applications."}
          </p>
        )}
        <ul className="mt-3 divide-y divide-border">
          {rows.map((a) => {
            const s = screeningOf.get(a.id);
            return (
              <li key={a.id}>
                <Link href={`/admin/posts/${post.id}/candidates/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-background">
                  <span className="font-medium">{a.candidate_name ?? "Candidate"}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    {s && <RecommendationBadge recommendation={s.recommendation as Recommendation} score={s.score} />}
                    <StatusChip status={a.status} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
