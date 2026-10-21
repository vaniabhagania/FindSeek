import Link from "next/link";
import {
  addSkill, deleteExperience, deleteSkill, setExperienceConfirmed,
  setSkillConfirmed, updateExperience, uploadCv,
} from "@/app/actions/profile";
import { Notice, Success } from "@/components/notice";
import { PreferencesForm } from "@/components/preferences-form";
import { toMonth } from "@/lib/data/profile";
import { getUser } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const { error, parsed, saved } = await searchParams;
  const { supabase, user } = await getUser();
  if (!supabase || !user) return <p className="muted">Connect Supabase to use FindSeek.</p>;

  const [{ data: profile }, { data: experiences }, { data: skills }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("experiences").select("*").eq("user_id", user.id).order("start_date", { ascending: false, nullsFirst: true }),
    supabase.from("skills").select("*").eq("user_id", user.id).order("name"),
  ]);
  const unconfirmed = (experiences ?? []).filter((e) => !e.confirmed).length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1>Your profile</h1>
        <Link href="/onboarding" className="btn-quiet">Describe it in your own words</Link>
      </header>
      <Notice error={error} />
      {saved && <Success>Saved. Your feed now follows these preferences.</Success>}
      {parsed && <Success>CV read. Review each item below and confirm it. Only confirmed facts are used for matching and tailoring.</Success>}

      <section className="panel p-5 sm:p-6">
        <h2 className="mb-5">What you&apos;re looking for</h2>
        <PreferencesForm profile={profile} next="/profile" extended />
      </section>

      <section className="card">
        <h2>Upload your CV</h2>
        <p className="mt-1 muted">PDF or plain text, up to 4 MB. We extract the facts; you confirm them.</p>
        <form action={uploadCv} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="file" name="cv" accept=".pdf,.txt,application/pdf,text/plain" required className="text-sm" />
          <SubmitButton working="Reading your CV…">Read my CV</SubmitButton>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2>Experience</h2>
          {unconfirmed > 0 && <span className="text-sm text-warn">{unconfirmed} to review</span>}
        </div>
        {(experiences ?? []).length === 0 && <p className="muted">Nothing yet. Upload your CV above.</p>}
        {(experiences ?? []).map((e) => (
          <div key={e.id} className={`card ${e.confirmed ? "" : "border-warn"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">{e.title}, {e.organisation}</div>
                <div className="muted capitalize">{e.kind}, {toMonth(e.start_date) ?? "?"} to {toMonth(e.end_date) ?? "present"}</div>
              </div>
              <div className="flex gap-2">
                <form action={setExperienceConfirmed.bind(null, e.id, !e.confirmed)}>
                  <button className={e.confirmed ? "btn-ghost" : "btn"}>{e.confirmed ? "Unconfirm" : "Confirm"}</button>
                </form>
                <form action={deleteExperience.bind(null, e.id)}><button className="btn-quiet">Delete</button></form>
              </div>
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {e.bullets.map((b: string, i: number) => <li key={i}>{b}</li>)}
            </ul>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-muted">Edit</summary>
              <form action={updateExperience.bind(null, e.id)} className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field name="title" label="Title" value={e.title} />
                <Field name="organisation" label="Organisation" value={e.organisation} />
                <Field name="start_date" label="Start (YYYY-MM)" value={toMonth(e.start_date)} />
                <Field name="end_date" label="End (YYYY-MM, blank if current)" value={toMonth(e.end_date)} />
                <div className="sm:col-span-2">
                  <label className="label" htmlFor={`bullets-${e.id}`}>Bullets (one per line)</label>
                  <textarea id={`bullets-${e.id}`} name="bullets" rows={5} defaultValue={e.bullets.join("\n")} className="input" />
                </div>
                <div><button className="btn">Save and confirm</button></div>
              </form>
            </details>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Skills</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(skills ?? []).map((s) => (
            <span key={s.id} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${s.confirmed ? "border-border" : "border-warn"}`}>
              {s.name}
              <form action={setSkillConfirmed.bind(null, s.id, !s.confirmed)}>
                <button className="text-xs text-muted underline">{s.confirmed ? "unconfirm" : "confirm"}</button>
              </form>
              <form action={deleteSkill.bind(null, s.id)}><button className="text-xs text-muted" aria-label={`Remove ${s.name}`}>✕</button></form>
            </span>
          ))}
        </div>
        <form action={addSkill} className="mt-4 flex gap-2">
          <input name="name" placeholder="Add a skill" className="input max-w-xs" />
          <button className="btn-ghost">Add</button>
        </form>
      </section>
    </div>
  );
}

function Field(props: { name: string; label: string; value?: string | null; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="label" htmlFor={props.name}>{props.label}</label>
      <input id={props.name} name={props.name} type={props.type ?? "text"} defaultValue={props.value ?? ""} placeholder={props.placeholder} className="input" />
    </div>
  );
}
