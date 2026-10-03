import Link from "next/link";
import { setApplicationStatus } from "@/app/actions/jobs";
import { getUser } from "@/lib/supabase/server";

const COLUMNS = [
  { status: "ready", label: "Ready to send" },
  { status: "applied", label: "Applied" },
  { status: "interview", label: "Interview" },
  { status: "offer", label: "Offer" },
  { status: "rejected", label: "Closed" },
];
const MOVES = ["ready", "interview", "offer", "rejected", "withdrawn"];

export default async function TrackerPage() {
  const { supabase, user } = await getUser();
  if (!supabase || !user) return <p className="muted">Connect Supabase to use FindSeek.</p>;

  const { data: apps } = await supabase
    .from("applications")
    .select("id, status, applied_at, updated_at, jobs(id, title, company)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Applications</h1>
      <div className="grid gap-4 md:grid-cols-5">
        {COLUMNS.map((col) => {
          const items = (apps ?? []).filter((a) =>
            col.status === "rejected" ? ["rejected", "withdrawn"].includes(a.status) : a.status === col.status || (col.status === "ready" && a.status === "tailoring"),
          );
          return (
            <section key={col.status} className="space-y-2">
              <h2 className="text-sm font-semibold">{col.label} <span className="muted">{items.length}</span></h2>
              {items.map((a) => {
                const job = Array.isArray(a.jobs) ? a.jobs[0] : a.jobs;
                return (
                  <div key={a.id} className="card p-3">
                    <Link href={`/jobs/${job?.id}`} className="text-sm font-medium hover:underline">{job?.title}</Link>
                    <div className="muted">{job?.company}</div>
                    {a.applied_at && <div className="mt-1 text-xs text-muted">Applied {new Date(a.applied_at).toLocaleDateString()}</div>}
                    <form action={setApplicationStatus.bind(null, a.id)} className="mt-2 flex gap-1">
                      <select name="status" defaultValue={a.status} className="input py-1 text-xs">
                        {MOVES.map((s) => <option key={s} value={s}>{s}</option>)}
                        {!MOVES.includes(a.status) && <option value={a.status}>{a.status}</option>}
                      </select>
                      <button className="btn-ghost px-2 py-1 text-xs">Move</button>
                    </form>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
