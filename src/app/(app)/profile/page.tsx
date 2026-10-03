import {
  addSkill, deleteExperience, deleteSkill, savePreferences, setExperienceConfirmed,
  setSkillConfirmed, updateExperience, uploadCv,
} from "@/app/actions/profile";
import { Notice } from "@/components/notice";
import { toMonth } from "@/lib/data/profile";
import { getUser } from "@/lib/supabase/server";

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const { error, parsed } = await searchParams;
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
      <h1 className="text-2xl font-semibold">Your profile</h1>
      <Notice error={error} />
      {parsed && (
        <div className="rounded-lg border border-good/40 bg-good/5 px-4 py-3 text-sm">
          CV read. Review each item below and confirm it. Only confirmed facts are used for matching and tailoring.
        </div>
      )}

      <section className="card">
        <h2 className="font-semibold">What you’re looking for</h2>
        <form action={savePreferences} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field name="full_name" label="Full name" value={profile?.full_name} />
          <Field name="headline" label="Headline" value={profile?.headline} placeholder="e.g. Backend engineer, 6 years in fintech" />
          <Field name="target_roles" label="Target roles (comma separated)" value={profile?.target_roles?.join(", ")} placeholder="Product designer, UX designer" />
          <Field name="domains" label="Domains / industries" value={profile?.domains?.join(", ")} placeholder="Fintech, healthcare" />
          <Field name="interests" label="Interests" value={profile?.interests?.join(", ")} />
          <Field name="location" label="Where you live" value={profile?.location} />
          <div>
            <label className="label" htmlFor="country_code">Job market</label>
            <select id="country_code" name="country_code" defaultValue={profile?.country_code ?? "us"} className="input">
              <option value="us">United States</option>
              <option value="gb">United Kingdom</option>
              <option value="ca">Canada</option>
              <option value="au">Australia</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="remote_preference">Work style</label>
            <select id="remote_preference" name="remote_preference" defaultValue={profile?.remote_preference ?? "any"} className="input">
              <option value="any">Any</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>
          </div>
          <Field name="min_match_score" label="Only show jobs scoring at least (%)" value={String(profile?.min_match_score ?? 60)} type="number" />
          <Field name="monthly_application_cap" label="Max applications per month" value={String(profile?.monthly_application_cap ?? 40)} type="number" />
          <div className="space-y-2 sm:col-span-2">
            <Check name="consent_ai" checked={Boolean(profile?.consent_ai_processing_at)}>
              I agree that FindSeek may send my CV and profile to its AI provider (Anthropic) to extract facts, score
              jobs and draft tailored CVs. I can withdraw this and delete my data at any time.
            </Check>
            <Check name="consent_analytics" checked={Boolean(profile?.consent_outcome_analytics_at)}>
              Optional: use the outcomes of my applications (anonymised) to improve tailoring for everyone.
            </Check>
          </div>
          <div className="sm:col-span-2"><button className="btn">Save</button></div>
        </form>
      </section>

      <section className="card">
        <h2 className="font-semibold">Upload your CV</h2>
        <p className="mt-1 muted">PDF or plain text, up to 4 MB. We extract the facts; you confirm them.</p>
        <form action={uploadCv} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="file" name="cv" accept=".pdf,.txt,application/pdf,text/plain" required className="text-sm" />
          <button className="btn">Read my CV</button>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Experience</h2>
          {unconfirmed > 0 && <span className="text-sm text-warn">{unconfirmed} to review</span>}
        </div>
        {(experiences ?? []).length === 0 && <p className="muted">Nothing yet. Upload your CV above.</p>}
        {(experiences ?? []).map((e) => (
          <div key={e.id} className={`card ${e.confirmed ? "" : "border-warn"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">{e.title} · {e.organisation}</div>
                <div className="muted">{e.kind} · {toMonth(e.start_date) ?? "?"} – {toMonth(e.end_date) ?? "present"}</div>
              </div>
              <div className="flex gap-2">
                <form action={setExperienceConfirmed.bind(null, e.id, !e.confirmed)}>
                  <button className={e.confirmed ? "btn-ghost" : "btn"}>{e.confirmed ? "Unconfirm" : "Confirm"}</button>
                </form>
                <form action={deleteExperience.bind(null, e.id)}><button className="btn-ghost">Delete</button></form>
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
        <h2 className="font-semibold">Skills</h2>
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

function Check({ name, checked, children }: { name: string; checked: boolean; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1" />
      <span>{children}</span>
    </label>
  );
}
