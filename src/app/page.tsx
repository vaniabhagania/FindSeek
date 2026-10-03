import Link from "next/link";
import { SetupNotice } from "@/components/setup-notice";

const STEPS = [
  { title: "Tell us about you", body: "Upload your CV and confirm each fact. The AI only ever uses what you've confirmed." },
  { title: "We find the jobs", body: "Fresh listings from Adzuna and company job boards, scored against your profile with clear reasons." },
  { title: "A CV for every job", body: "Each CV is reworded and reordered for the role, never invented. You review every change." },
  { title: "You click apply", body: "We open the employer's page with everything ready. You stay in control, and your accounts stay safe." },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const { deleted } = await searchParams;
  return (
    <>
      <SetupNotice />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <span className="text-lg font-semibold">FindSeek</span>
        <Link href="/login" className="btn-ghost">Sign in</Link>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        {deleted && <p className="mb-6 muted">Your account and data have been deleted.</p>}
        <section className="py-16">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Stop searching. Start preparing.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            FindSeek finds jobs that fit you and tailors your CV to each one, truthfully, so your time goes
            into interview prep instead of job boards.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/login" className="btn">Get started free</Link>
          </div>
        </section>
        <section className="grid gap-4 pb-16 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <div key={s.title} className="card">
              <div className="muted">Step {i + 1}</div>
              <h2 className="mt-1 font-semibold">{s.title}</h2>
              <p className="mt-2 muted">{s.body}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="mx-auto w-full max-w-5xl px-4 py-8 muted">
        FindSeek never invents experience and never applies on your behalf without your approval.
      </footer>
    </>
  );
}
