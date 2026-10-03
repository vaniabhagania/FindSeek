import Link from "next/link";
import { getUser } from "@/lib/supabase/server";

export default async function Dashboard() {
  const { supabase, user } = await getUser();
  if (!supabase || !user) return <p className="muted">Connect Supabase to use FindSeek.</p>;

  const [{ data: profile }, { count: confirmed }, { count: matches }, { data: apps }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("experiences").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("confirmed", true),
    supabase.from("job_matches").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("dismissed", false),
    supabase.from("applications").select("status").eq("user_id", user.id),
  ]);
  const byStatus = (s: string) => (apps ?? []).filter((a) => a.status === s).length;

  const steps = [
    { done: Boolean(profile?.consent_ai_processing_at && profile?.target_roles?.length), label: "Set your target roles and give consent", href: "/profile" },
    { done: (confirmed ?? 0) > 0, label: "Upload your CV and confirm your experience", href: "/profile" },
    { done: (matches ?? 0) > 0, label: "Find your first matches", href: "/jobs" },
    { done: (apps ?? []).some((a) => a.status !== "saved"), label: "Tailor a CV and apply", href: "/jobs" },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Hi{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</h1>
      <section className="grid gap-4 sm:grid-cols-4">
        {[
          ["Matches", matches ?? 0],
          ["Ready to send", byStatus("ready")],
          ["Applied", byStatus("applied")],
          ["Interviews", byStatus("interview")],
        ].map(([label, value]) => (
          <div key={label} className="card">
            <div className="muted">{label}</div>
            <div className="mt-1 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </section>
      <section className="card">
        <h2 className="font-semibold">Getting started</h2>
        <ol className="mt-3 space-y-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-3 text-sm">
              <span className={s.done ? "text-good" : "text-muted"}>{s.done ? "✓" : "○"}</span>
              <Link href={s.href} className={s.done ? "text-muted line-through" : "underline"}>{s.label}</Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
