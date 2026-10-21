import { savePreferences } from "@/app/actions/profile";
import { INDIAN_CITIES } from "@/lib/india/location";

const POPULAR = ["Bengaluru", "Hyderabad", "Pune", "Mumbai", "Delhi NCR", "Gurugram", "Noida", "Chennai", "Kolkata", "Ahmedabad", "Kochi", "Jaipur"];
const JOB_TYPES = [
  { value: "full_time", label: "Full-time jobs" },
  { value: "internship", label: "Internships" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "apprenticeship", label: "Apprenticeships" },
];
const STAGES = [
  { value: "student", label: "Student" },
  { value: "fresher", label: "Fresher" },
  { value: "experienced", label: "Working professional" },
];
const MODES = [
  { value: "any", label: "Any" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "In office" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Profile = Record<string, any> | null | undefined;

/** One form for onboarding and the profile page, so the two can never drift apart. */
export function PreferencesForm({ profile, next, extended = false, submitLabel = "Save" }: { profile: Profile; next: string; extended?: boolean; submitLabel?: string }) {
  const chosen: string[] = profile?.preferred_cities ?? [];
  const cities = [...new Set([...chosen, ...POPULAR])];
  const others = Object.keys(INDIAN_CITIES).filter((c) => !cities.includes(c));
  const jobTypes: string[] = profile?.job_types ?? ["full_time"];
  const internOnly = jobTypes.length === 1 && jobTypes[0] === "internship";
  const pay = profile?.expected_pay_min_inr ? Number(profile.expected_pay_min_inr) : null;
  const payValue = pay == null ? "" : internOnly ? String(Math.round(pay / 12)) : String(Math.round((pay / 100000) * 10) / 10);

  return (
    <form action={savePreferences} className="space-y-7">
      <input type="hidden" name="next" value={next} />

      {extended && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="full_name" label="Full name" value={profile?.full_name} autoComplete="name" />
          <Field name="headline" label="Headline" value={profile?.headline} placeholder="Final-year B.Tech CSE, backend and data" />
          <Field name="location" label="Where you live" value={profile?.location} placeholder="Bengaluru" autoComplete="address-level2" />
        </div>
      )}

      <Group legend="Where you are in your career">
        <div className="flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <label key={s.value} className="chip"><input type="radio" name="career_stage" value={s.value} defaultChecked={profile?.career_stage === s.value} />{s.label}</label>
          ))}
        </div>
        <div className="mt-3 max-w-48">
          <label className="label" htmlFor="experience_years">Years of work experience</label>
          <input id="experience_years" name="experience_years" type="number" min={0} max={60} step="0.5" defaultValue={profile?.experience_years ?? ""} className="input" placeholder="0" />
        </div>
      </Group>

      <Group legend="What you want to do">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="target_roles" label="Roles" value={profile?.target_roles?.join(", ")} placeholder="Backend developer, Data analyst" hint="Separate with commas." />
          <Field name="domains" label="Fields or industries" value={profile?.domains?.join(", ")} placeholder="Fintech, Edtech" hint="Optional." />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {JOB_TYPES.map((t) => (
            <label key={t.value} className="chip"><input type="checkbox" name="job_types" value={t.value} defaultChecked={jobTypes.includes(t.value)} />{t.label}</label>
          ))}
        </div>
      </Group>

      <Group legend="Where you'll work">
        <div className="flex flex-wrap gap-2">
          {cities.map((c) => (
            <label key={c} className="chip"><input type="checkbox" name="preferred_cities" value={c} defaultChecked={chosen.includes(c)} />{c}</label>
          ))}
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-accent">More cities</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {others.map((c) => (
              <label key={c} className="chip"><input type="checkbox" name="preferred_cities" value={c} defaultChecked={chosen.includes(c)} />{c}</label>
            ))}
          </div>
        </details>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-muted">Work mode</span>
          {MODES.map((m) => (
            <label key={m.value} className="chip"><input type="radio" name="remote_preference" value={m.value} defaultChecked={(profile?.remote_preference ?? "any") === m.value} />{m.label}</label>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="open_to_relocate" defaultChecked={Boolean(profile?.open_to_relocate)} className="h-4 w-4 accent-[var(--accent)]" />
          I&apos;m open to relocating for the right role
        </label>
      </Group>

      <Group legend="Your terms">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="expected_pay">Minimum pay</label>
            <div className="flex gap-2">
              <input id="expected_pay" name="expected_pay" type="number" min={0} step="0.1" defaultValue={payValue} className="input" placeholder={internOnly ? "15000" : "6"} />
              <select name="expected_pay_unit" defaultValue={internOnly ? "month" : "lpa"} className="input w-auto" aria-label="Pay unit">
                <option value="lpa">LPA</option>
                <option value="month">₹ per month</option>
              </select>
            </div>
            <p className="hint">Jobs paying less are kept out of your feed.</p>
          </div>
          <div>
            <label className="label" htmlFor="notice_period_days">Notice period (days)</label>
            <input id="notice_period_days" name="notice_period_days" type="number" min={0} max={365} defaultValue={profile?.notice_period_days ?? ""} className="input" placeholder="0 if you can join now" />
            <p className="hint">Jobs that need you sooner are flagged.</p>
          </div>
        </div>
        <div className="mt-4">
          <Field name="deal_breakers" label="Deal-breakers" value={profile?.deal_breakers?.join(", ")} placeholder="service bond, night shifts, sales targets" hint="Jobs that mention these are kept out of your feed." />
        </div>
      </Group>

      <Group legend="Permissions">
        <div className="space-y-2.5">
          <Check name="consent_ai" checked={Boolean(profile?.consent_ai_processing_at)}>
            Let FindSeek send my CV and profile to its AI provider (Anthropic) to read my CV, match jobs and draft tailored
            CVs. I can turn this off and delete my data at any time.
          </Check>
          <Check name="consent_analytics" checked={Boolean(profile?.consent_outcome_analytics_at)}>
            Optional: use the outcomes of my applications, anonymised, to improve tailoring for everyone.
          </Check>
        </div>
      </Group>

      {extended && (
        <Group legend="Limits">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="min_match_score" label="Only show matches scoring at least" value={String(profile?.min_match_score ?? 60)} type="number" hint="Out of 100." />
            <Field name="monthly_application_cap" label="Most applications per month" value={String(profile?.monthly_application_cap ?? 40)} type="number" hint="Keeps quality over volume." />
          </div>
        </Group>
      )}

      <div className="flex items-center gap-3 border-t border-line pt-5">
        <button className="btn">{submitLabel}</button>
      </div>
    </form>
  );
}

function Group({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="display mb-3 text-[17px] font-semibold">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Field(props: { name: string; label: string; value?: string | null; placeholder?: string; type?: string; hint?: string; autoComplete?: string }) {
  return (
    <div>
      <label className="label" htmlFor={props.name}>{props.label}</label>
      <input id={props.name} name={props.name} type={props.type ?? "text"} defaultValue={props.value ?? ""} placeholder={props.placeholder} autoComplete={props.autoComplete} className="input" />
      {props.hint && <p className="hint">{props.hint}</p>}
    </div>
  );
}

function Check({ name, checked, children }: { name: string; checked: boolean; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 text-[15px]">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
      <span className="max-w-[64ch]">{children}</span>
    </label>
  );
}
