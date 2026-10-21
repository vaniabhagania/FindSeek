import { Notice } from "@/components/notice";
import { getUser } from "@/lib/supabase/server";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { error } = await searchParams;
  const { supabase, user } = await getUser();
  if (!supabase || !user) return <p className="muted">Connect Supabase to use FindSeek.</p>;

  const { data: log } = await supabase
    .from("ai_audit_log").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);

  return (
    <div className="space-y-6">
      <h1>Privacy and your data</h1>
      <Notice error={error} />
      <section className="card">
        <h2 className="font-semibold">What the AI did with your data</h2>
        <p className="mt-1 muted">Every AI action on your account is recorded here.</p>
        <ul className="mt-3 divide-y divide-border text-sm">
          {(log ?? []).map((l) => (
            <li key={l.id} className="py-2">
              <span className="font-medium">{l.action.replace("_", " ")}</span>{" "}
              <span className="muted">{new Date(l.created_at).toLocaleString()} · {l.model}</span>
              {l.output_summary && <div className="muted">{l.output_summary}</div>}
            </li>
          ))}
          {(log ?? []).length === 0 && <li className="py-2 muted">Nothing yet.</li>}
        </ul>
      </section>
      <section className="card">
        <h2 className="font-semibold">Download your data</h2>
        <p className="mt-1 muted">Everything FindSeek stores about you, as a JSON file.</p>
        <a href="/api/account/export" className="btn mt-3">Download</a>
      </section>
      <section className="card border-bad/50">
        <h2 className="font-semibold text-bad">Delete your account</h2>
        <p className="mt-1 muted">Permanently removes your profile, CVs, matches, applications and AI logs.</p>
        <form action="/api/account/delete" method="post" className="mt-3 flex flex-wrap gap-2">
          <input name="confirm" placeholder="Type DELETE" className="input max-w-40" />
          <button className="btn bg-bad">Delete everything</button>
        </form>
      </section>
    </div>
  );
}
