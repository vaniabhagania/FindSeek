import Link from "next/link";
import { Caution, Check, Cross, Pulse, Shield } from "@/components/icons";
import { SetupNotice } from "@/components/setup-notice";

const GATE = [
  { title: "A real hiring source", body: "The company's own careers page, an applicant tracking system, a LinkedIn job listing or a company email. Never a WhatsApp number, Google Form or personal Gmail." },
  { title: "A full job description", body: "Enough to judge the role, not a two-line teaser." },
  { title: "Qualifications stated", body: "What degree, skills or years of experience it actually takes." },
  { title: "Pay stated", body: "CTC, salary range or stipend, in rupees. “Competitive” doesn't pass." },
  { title: "No signs of a fake offer", body: "Registration fees, security deposits, “no interview, direct joining” and the rest." },
  { title: "Open to you in India", body: "“Remote” that really means remote within the US is caught before you waste a CV on it." },
];

const FLOW = [
  { title: "Say what you want, in your words", body: "Stage, roles, cities, pay, notice period, deal-breakers. FindSeek turns it into filters you confirm." },
  { title: "Get matches that fit your rules", body: "Only verified, open jobs are scored, each with plain reasons for and against." },
  { title: "Send a CV made for each job", body: "Reworded and reordered from facts you've confirmed. Nothing invented; you approve every change." },
  { title: "Spend the time on interview prep", body: "Track every application in one place, with what to prepare for each." },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const { deleted } = await searchParams;
  return (
    <>
      <SetupNotice />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <span className="display text-[24px] font-semibold" style={{ fontStretch: "80%" }}>FindSeek</span>
        <Link href="/login" className="btn-quiet">Sign in</Link>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5">
        {deleted && <p className="mb-6 muted">Your account and data have been deleted.</p>}

        <section className="grid items-center gap-12 py-12 md:grid-cols-[1.1fr_1fr] md:py-20">
          <div>
            <h1 className="max-w-[14ch] text-[44px] leading-[0.98] font-semibold sm:text-[64px]" style={{ fontStretch: "78%" }}>
              Every job is checked before it reaches you.
            </h1>
            <p className="mt-6 max-w-[46ch] text-[17px] text-muted">
              FindSeek gathers openings and internships across India, holds back anything without a real employer, a proper
              description or stated pay, and tailors your CV to the ones that fit you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="btn h-11 px-5 text-base">Start your search</Link>
              <Link href="#checks" className="btn-ghost h-11 px-5 text-base">What we check</Link>
            </div>
          </div>
          <Specimen />
        </section>

        <section id="checks" className="border-t border-line py-14">
          <h2 className="text-[30px]">What every listing has to pass</h2>
          <p className="mt-2 max-w-[58ch] text-[15px] text-muted">
            Six checks, the same for every source, including jobs you bring from LinkedIn, Instagram, Facebook or a WhatsApp
            group. A listing that fails one is held back and the reason is recorded.
          </p>
          <ul className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {GATE.map((g) => (
              <li key={g.title} className="flex gap-3">
                <Check className="mt-1 shrink-0 text-good" />
                <div>
                  <h3>{g.title}</h3>
                  <p className="mt-1 text-[15px] text-muted">{g.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-line py-14">
          <h2 className="text-[30px]">How it works</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {FLOW.map((f, i) => (
              <li key={f.title}>
                <span className="figure text-[40px] leading-none font-semibold text-accent">{i + 1}</span>
                <h3 className="mt-3">{f.title}</h3>
                <p className="mt-1.5 text-[15px] text-muted">{f.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl border-t border-line px-5 py-8 text-sm text-muted">
        FindSeek never invents experience, never applies without your approval, and never charges candidates to apply.
      </footer>
    </>
  );
}

/** An example listing showing the check ledger, the thing that makes FindSeek different. */
function Specimen() {
  return (
    <figure className="rise">
      <div className="panel overflow-hidden shadow-[0_1px_0_var(--line),0_24px_48px_-28px_rgb(14_18_32/0.35)]">
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="display text-[23px] font-semibold leading-tight">Backend Engineer Intern</div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 text-sm text-muted">
                <span className="font-medium text-ink">A payments startup</span>
                <span>Bengaluru</span>
                <span>Hybrid</span>
                <span className="figure text-[15px] font-semibold text-ink">₹25k/month</span>
              </div>
            </div>
            <div className="text-right">
              <div className="figure text-[30px] leading-none font-semibold">84</div>
              <div className="mt-1 text-xs text-muted">match</div>
            </div>
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
            <li className="tick tick-good"><Check /> In Bengaluru</li>
            <li className="tick tick-good"><Check /> Pays above your ₹20k</li>
            <li className="tick tick-caution"><Caution /> Starts in 3 weeks</li>
            <li className="tick text-muted"><Pulse /> Checked live 2 hours ago</li>
          </ul>
        </div>
        <div className="border-t border-line bg-raised px-6 py-4">
          <div className="flex items-center gap-2 text-sm font-medium"><Shield className="text-good" /> Verified listing</div>
          <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-muted">
            <li className="flex items-center gap-1.5"><Check className="text-good" /> Company careers page</li>
            <li className="flex items-center gap-1.5"><Check className="text-good" /> Qualifications stated</li>
            <li className="flex items-center gap-1.5"><Check className="text-good" /> Stipend stated</li>
            <li className="flex items-center gap-1.5"><Check className="text-good" /> No fees or deposits</li>
          </ul>
        </div>
        <div className="flex items-center gap-2 border-t border-line px-6 py-3 text-sm text-muted">
          <Cross className="text-blocker" /> 3 similar posts held back today: no pay stated, WhatsApp-only hiring
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-muted">Example listing</figcaption>
    </figure>
  );
}
