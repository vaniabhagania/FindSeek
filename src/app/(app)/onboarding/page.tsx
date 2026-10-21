import Link from "next/link";
import { readMyWords, uploadCv } from "@/app/actions/profile";
import { Check, Spark } from "@/components/icons";
import { Notice, Success } from "@/components/notice";
import { PreferencesForm } from "@/components/preferences-form";
import { getUser } from "@/lib/supabase/server";

const STEPS = [
  { key: "words", label: "In your words" },
  { key: "prefs", label: "Check your preferences" },
  { key: "cv", label: "Add your CV" },
] as const;

const EXAMPLES = [
  "Final-year B.Tech CSE student in Pune. Looking for backend or data internships from January, remote or in Pune or Bengaluru. Stipend at least ₹15k a month. Python, SQL, some React. No unpaid roles.",
  "Two years as a QA engineer at a Noida service company, 60-day notice. Want to move into product-based companies as an SDET in Gurugram or Noida, 9 LPA or more. No night shifts, no bonds.",
];

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const sp = await searchParams;
  const step = (STEPS.find((s) => s.key === sp.step)?.key ?? "words") as (typeof STEPS)[number]["key"];
  const { supabase, user } = await getUser();
  if (!supabase || !user) return <p className="muted">Connect Supabase to use FindSeek.</p>;

  const [{ data: profile }, { count: experiences }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("experiences").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  const at = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="max-w-2xl space-y-7">
      <ol className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2 text-sm" aria-current={i === at ? "step" : undefined}>
            <span
              className={`figure flex h-6 w-6 items-center justify-center rounded-full border text-[13px] ${
                i < at ? "border-accent bg-accent text-accent-foreground" : i === at ? "border-accent text-accent" : "border-line text-muted"
              }`}
            >
              {i < at ? <Check /> : i + 1}
            </span>
            <span className={i === at ? "text-ink" : "text-muted"}>{s.label}</span>
          </li>
        ))}
      </ol>

      <Notice error={sp.error} />

      {step === "words" && (
        <>
          <header>
            <h1>What are you looking for?</h1>
            <p className="mt-2 max-w-[58ch] text-[15px] text-muted">
              Write it the way you&apos;d tell a friend: your stage, the roles, cities, pay, when you can join and what you
              won&apos;t accept. FindSeek turns it into filters you can check on the next step.
            </p>
          </header>
          <form action={readMyWords} className="space-y-4">
            <textarea
              name="intake"
              required
              minLength={20}
              rows={7}
              defaultValue={profile?.intake_text ?? ""}
              className="input text-base leading-relaxed"
              placeholder={EXAMPLES[0]}
              aria-label="What you're looking for"
            />
            {!profile?.consent_ai_processing_at && (
              <label className="flex items-start gap-2.5 text-[15px]">
                <input type="checkbox" name="consent_ai" required className="mt-1.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                <span className="max-w-[60ch]">
                  Let FindSeek send what I write, my CV and profile to its AI provider (Anthropic) to set up my search and
                  tailor CVs. I can turn this off and delete my data at any time.
                </span>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn"><Spark /> Set up my search</button>
              <Link href="/onboarding?step=prefs" className="btn-quiet">Fill it in myself instead</Link>
            </div>
          </form>
          <details className="text-sm">
            <summary className="cursor-pointer text-accent">See another example</summary>
            <p className="mt-2 max-w-[60ch] text-muted">{EXAMPLES[1]}</p>
          </details>
        </>
      )}

      {step === "prefs" && (
        <>
          <header>
            <h1>Check your preferences</h1>
            <p className="mt-2 max-w-[58ch] text-[15px] text-muted">
              These decide which jobs reach you. Anything that breaks them stays out of your feed.
            </p>
          </header>
          {sp.from === "ai" && <Success>Filled in from what you wrote. Check each part and change anything that&apos;s off.</Success>}
          <div className="panel p-5 sm:p-6">
            <PreferencesForm profile={profile} next="/onboarding?step=cv" submitLabel="Save and continue" />
          </div>
        </>
      )}

      {step === "cv" && (
        <>
          <header>
            <h1>Add your CV</h1>
            <p className="mt-2 max-w-[58ch] text-[15px] text-muted">
              FindSeek reads it and lists each job, project and skill for you to confirm. Only what you confirm is ever used
              to match or tailor, so nothing gets invented.
            </p>
          </header>
          {sp.parsed && <Success>Your CV has been read. Confirm each item on your profile to start matching.</Success>}
          <form action={uploadCv} className="panel flex flex-wrap items-center gap-3 p-5 sm:p-6">
            <input type="hidden" name="next" value="/onboarding" />
            <input type="file" name="cv" accept=".pdf,.txt,application/pdf,text/plain" required className="text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-raised file:px-3 file:py-2 file:text-sm file:text-ink" />
            <button className="btn">Read my CV</button>
            <p className="w-full text-sm text-muted">PDF or plain text, up to 4 MB.</p>
          </form>
          <div className="flex flex-wrap gap-3">
            {(experiences ?? 0) > 0 ? (
              <Link href="/profile" className="btn">Confirm what was found</Link>
            ) : (
              <Link href="/profile" className="btn-quiet">I&apos;ll add my experience by hand</Link>
            )}
            <Link href="/jobs?view=all" className="btn-quiet">Browse verified jobs first</Link>
          </div>
        </>
      )}
    </div>
  );
}
