import Link from "next/link";
import { createEmployer } from "@/app/actions/admin";
import { Notice } from "@/components/notice";
import { getRecruiter } from "@/lib/admin/session";

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const { error } = await searchParams;
  const { supabase, user, employer } = await getRecruiter();
  if (!supabase || !user) return <p className="muted">Connect Supabase to use FindSeek.</p>;

  if (!employer) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1>Hire with FindSeek</h1>
          <p className="mt-2 muted">
            Post an opening, tell FindSeek what you need, and get a short, explainable brief on each applicant.
            You make every hiring decision.
          </p>
        </div>
        <Notice error={error} />
        <form action={createEmployer} className="card space-y-4">
          <div>
            <label className="label" htmlFor="name">Organisation name</label>
            <input id="name" name="name" required minLength={2} maxLength={120} className="input" placeholder="Acme GmbH" />
          </div>
          <button className="btn">Create employer account</button>
        </form>
      </div>
    );
  }

  const { data: posts } = await supabase
    .from("job_posts").select("id, title, status, location, created_at")
    .eq("employer_id", employer.id).order("created_at", { ascending: false });

  const ids = (posts ?? []).map((p) => p.id);
  const { data: apps } = ids.length
    ? await supabase.from("post_applications").select("job_post_id, status").in("job_post_id", ids)
    : { data: [] };
  const counts = new Map<string, { total: number; waiting: number }>();
  for (const a of apps ?? []) {
    const c = counts.get(a.job_post_id) ?? { total: 0, waiting: 0 };
    if (a.status !== "withdrawn") c.total += 1;
    if (a.status === "submitted" || a.status === "screened") c.waiting += 1;
    counts.set(a.job_post_id, c);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Your openings</h1>
        <Link href="/admin/posts/new" className="btn">New opening</Link>
      </div>
      <Notice error={error} />
      {(posts ?? []).length === 0 && <p className="muted">No openings yet. Create one to start receiving applications.</p>}
      <div className="space-y-3">
        {(posts ?? []).map((p) => {
          const c = counts.get(p.id) ?? { total: 0, waiting: 0 };
          return (
            <Link key={p.id} href={`/admin/posts/${p.id}`} className="card block hover:border-accent">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{p.title}</div>
                  <div className="muted">{p.location ?? "Location not listed"}</div>
                </div>
                <div className="text-right text-sm">
                  <div className={p.status === "open" ? "text-good" : "text-muted"}>
                    {p.status === "open" ? "Open" : p.status === "closed" ? "Closed" : "Draft"}
                  </div>
                  <div className="muted">{c.total} applicant{c.total === 1 ? "" : "s"}{c.waiting ? ` · ${c.waiting} awaiting a decision` : ""}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
