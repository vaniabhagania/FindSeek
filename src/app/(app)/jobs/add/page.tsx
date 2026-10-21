import Link from "next/link";
import { submitListing } from "@/app/actions/jobs";
import { Notice } from "@/components/notice";

const PLATFORMS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "naukri", label: "Naukri" },
  { value: "x", label: "X" },
  { value: "other", label: "Somewhere else" },
];

const CHECKS = [
  "A real hiring source: the company's own site, an applicant tracking system, a LinkedIn job listing or a company email. Not a WhatsApp number, Google Form, link shortener or personal Gmail.",
  "A proper description that says what qualifications or skills are needed.",
  "Stated pay: CTC, salary range or stipend. “Competitive” doesn't count.",
  "None of the warning signs of a fake offer, like fees, deposits or “no interview, direct joining”.",
  "Open to someone living in India.",
];

export default async function AddJobPage({ searchParams }: PageProps<"/jobs/add">) {
  const { error } = await searchParams;
  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/jobs" className="btn-quiet -ml-2.5">Back to jobs</Link>
      <header>
        <h1>Bring a job from anywhere</h1>
        <p className="mt-2 max-w-[60ch] text-[15px] text-muted">
          Found an opening on LinkedIn, Instagram, Facebook or in a WhatsApp group? Paste the post. FindSeek checks it the
          same way it checks every listing, and only lets you tailor a CV once it passes.
        </p>
      </header>
      <Notice error={error} />

      <form action={submitListing} className="panel space-y-5 p-5 sm:p-6">
        <div>
          <label htmlFor="post" className="label">The post</label>
          <textarea
            id="post"
            name="post"
            required
            minLength={120}
            rows={12}
            className="input leading-relaxed"
            placeholder={"We're hiring a Frontend Intern at …\nLocation: Bengaluru (hybrid)\nRequirements: …\nStipend: ₹20,000/month\nApply: https://…"}
          />
          <p className="hint">Copy the whole text, including requirements, pay and how to apply.</p>
        </div>

        <fieldset>
          <legend className="label">Where did you see it?</legend>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p, i) => (
              <label key={p.value} className="chip">
                <input type="radio" name="seen_on" value={p.value} defaultChecked={i === 0} />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="apply_link" className="label">Application link or email</label>
            <input id="apply_link" name="apply_link" className="input" placeholder="https://careers.company.com/…" />
            <p className="hint">If it isn&apos;t in the post. It still has to be the employer&apos;s own.</p>
          </div>
          <div>
            <label htmlFor="source_url" className="label">Link to the post</label>
            <input id="source_url" name="source_url" type="url" className="input" placeholder="https://www.linkedin.com/…" />
            <p className="hint">Optional, so you can find it again.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <button className="btn">Check this job</button>
          <span className="muted">Takes a few seconds. Stays private to you.</span>
        </div>
      </form>

      <section>
        <h2>What it has to pass</h2>
        <ul className="mt-3 space-y-2.5">
          {CHECKS.map((c) => (
            <li key={c} className="flex gap-3 text-[15px]">
              <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span className="max-w-[64ch]">{c}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 muted max-w-[64ch]">
          FindSeek doesn&apos;t scrape LinkedIn, Instagram or Facebook. Their terms forbid it and none of them offers a jobs
          feed to read from, so jobs from those sites come in only when you bring them.
        </p>
      </section>
    </div>
  );
}
