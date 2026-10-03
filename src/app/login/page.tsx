import Link from "next/link";
import { signInWithEmail } from "@/app/actions/auth";
import { Notice } from "@/components/notice";
import { SetupNotice } from "@/components/setup-notice";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, sent, next } = await searchParams;
  return (
    <>
      <SetupNotice />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
        <Link href="/" className="mb-8 text-lg font-semibold">FindSeek</Link>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 mb-6 muted">We’ll email you a one-time sign-in link.</p>
        <Notice error={error} />
        {sent ? (
          <div className="card">Check your inbox for the sign-in link.</div>
        ) : (
          <form action={signInWithEmail} className="space-y-4">
            <input type="hidden" name="next" value={typeof next === "string" ? next : "/dashboard"} />
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required autoComplete="email" className="input" />
            </div>
            <button className="btn w-full">Email me a link</button>
          </form>
        )}
      </main>
    </>
  );
}
